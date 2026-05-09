import statueLineImage from '../assets/ariadne-statue-lines.png';

export default function StatueLineBackdrop() {
  return (
    <div className="statue-line-backdrop" aria-hidden="true">
      <img className="statue-line-backdrop__image" src={statueLineImage} alt="" draggable="false" />
    </div>
  );
}
