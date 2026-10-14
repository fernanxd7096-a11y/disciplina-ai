import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { Button } from '../Button';
import { ProgressRing } from '../ProgressRing';
import { SegmentedControl } from '../SegmentedControl';
import { TextField } from '../TextField';

describe('Button', () => {
  it('llama a onPress al tocarlo', () => {
    const onPress = jest.fn();
    render(<Button label="Guardar" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('no responde cuando está deshabilitado o cargando', () => {
    const onPress = jest.fn();
    const { rerender } = render(<Button label="Guardar" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    rerender(<Button label="Guardar" onPress={onPress} loading />);
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ProgressRing', () => {
  it('expone el porcentaje a lectores de pantalla', () => {
    render(<ProgressRing value={3} total={4} accessibilityLabel="Hábitos de hoy" />);
    const ring = screen.getByRole('progressbar', { name: 'Hábitos de hoy' });
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 75 });
  });
});

describe('TextField', () => {
  it('muestra el error en lugar de la ayuda', () => {
    render(<TextField label="Correo" hint="Tu correo de acceso" error="Correo no válido" />);
    expect(screen.getByText('Correo no válido')).toBeTruthy();
    expect(screen.queryByText('Tu correo de acceso')).toBeNull();
  });
});

describe('SegmentedControl', () => {
  function Harness() {
    const [v, setV] = useState<'a' | 'b'>('a');
    return (
      <SegmentedControl
        accessibilityLabel="Vista"
        value={v}
        onChange={setV}
        options={[
          { value: 'a', label: 'Uno' },
          { value: 'b', label: 'Dos' },
        ]}
      />
    );
  }

  it('cambia la opción seleccionada', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Uno' })).toBeSelected();
    fireEvent.press(screen.getByRole('tab', { name: 'Dos' }));
    expect(screen.getByRole('tab', { name: 'Dos' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Uno' })).not.toBeSelected();
  });
});
