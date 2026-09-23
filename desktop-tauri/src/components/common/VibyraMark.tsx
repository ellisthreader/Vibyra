import { vibyraLogoUrl } from "../../assets/vibyraLogo";

/** Vibyra's own V, for the places the app speaks as itself. The artwork is
 * ~4:3, so the round chip letterboxes it rather than squashing it to square. */
export function VibyraMark({ size = 22, label }: { size?: number; label?: string }) {
  return (
    <span
      className="vibyra-mark"
      style={{ width: size, height: size }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <img src={vibyraLogoUrl} alt="" />
    </span>
  );
}
