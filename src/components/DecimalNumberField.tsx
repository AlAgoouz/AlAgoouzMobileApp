import {useState, type ComponentPropsWithoutRef} from 'react';
import {parseDecimalInput} from '../lib/decimalInput';

interface DecimalNumberFieldProps extends Omit<ComponentPropsWithoutRef<'input'>,'value'|'type'|'onChange'|'min'> {
  value: number;
  positive?: boolean;
  onValue: (number: number) => void;
  onValidity: (valid: boolean) => void;
}

export function DecimalNumberField({value, positive, onValue, onValidity, ...props}: DecimalNumberFieldProps) {
  const [draft, setDraft] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  function parse(text: string) {
    const number = parseDecimalInput(text);
    return number === undefined || number < 0 || (positive && number === 0) ? undefined : number;
  }

  return <input {...props} type="text" inputMode="decimal" value={draft ?? String(value)}
    aria-invalid={invalid || undefined}
    onChange={event => {
      const text = event.currentTarget.value;
      setDraft(text);
      const number = parse(text);
      onValidity(number !== undefined);
      if (number !== undefined) {
        setInvalid(false);
        onValue(number);
      }
    }}
    onBlur={event => {
      const valid = parse(event.currentTarget.value) !== undefined;
      setInvalid(!valid);
      onValidity(valid);
      if (valid) setDraft(undefined);
    }} />;
}
