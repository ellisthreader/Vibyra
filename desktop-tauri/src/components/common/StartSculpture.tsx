import logoUrl from '../../assets/vibyra-cobalt.png';
import '../../styles/start-sculpture.css';

/** The canonical V, with a finite light ripple and a quiet resting state. */
export function StartSculpture() {
  return <div className="start-sculpture" aria-hidden="true">
    <div className="start-sculpture__light" />
    <div className="start-sculpture__ripples"><i /><i /><i /></div>
    <div className="start-sculpture__shape">
      <img className="start-sculpture__logo" src={logoUrl} alt="" width={154} height={113} />
    </div>
    <span className="start-sculpture__spark start-sculpture__spark--one" />
    <span className="start-sculpture__spark start-sculpture__spark--two" />
  </div>;
}
