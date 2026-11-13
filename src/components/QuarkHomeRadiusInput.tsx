import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatQuarkRadiusKm, parseQuarkRadiusKm } from "@/lib/quark-location-radius";

export function QuarkHomeRadiusInput({
  valueMeters,
  onChange,
  label = "Distância considerada próxima",
}: {
  valueMeters: number;
  onChange: (meters: number) => void;
  label?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() => formatQuarkRadiusKm(valueMeters));
  const invalid = parseQuarkRadiusKm(text) === null;

  // Keep both radius inputs in sync without replacing a decimal still being typed.
  useEffect(() => {
    setText((current) =>
      parseQuarkRadiusKm(current) === valueMeters ? current : formatQuarkRadiusKm(valueMeters),
    );
  }, [valueMeters]);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label} (km)</Label>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        placeholder="Ex.: 1,5"
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          const meters = parseQuarkRadiusKm(next);
          if (meters !== null) onChange(meters);
        }}
        onBlur={() => {
          if (!invalid) setText(formatQuarkRadiusKm(valueMeters));
        }}
      />
      <p id={`${id}-help`} className="text-[10px] text-muted-foreground">
        {invalid
          ? `Informe um valor maior que zero em km. Mantido: ${valueMeters.toLocaleString("pt-BR")} metros.`
          : `${valueMeters.toLocaleString("pt-BR")} metros · Ex.: 1,5 km = 1.500 m`}
      </p>
    </div>
  );
}
