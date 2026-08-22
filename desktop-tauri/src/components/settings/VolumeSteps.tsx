const STEPS = [0.2, 0.4, 0.6, 0.8, 1];

/** Five stepped bars instead of a range input. At this size a slider is fiddly
 * and, bound to `onChange`, would rewrite settings.json on every pixel of the
 * drag — every save here is an atomic disk write. */
export function VolumeSteps({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="vol-steps" role="group" aria-label="Notification volume">
      {STEPS.map((step, index) => (
        <button
          key={step}
          type="button"
          className="vol-step"
          aria-pressed={value >= step - 0.001}
          aria-label={`Volume ${index + 1} of ${STEPS.length}`}
          disabled={disabled}
          onClick={() => onChange(step)}
        />
      ))}
    </div>
  );
}
