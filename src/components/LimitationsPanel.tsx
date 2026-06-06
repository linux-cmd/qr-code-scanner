export function LimitationsPanel({ limitations }: { limitations: string[] }) {
  return (
    <ul className="signals">
      {limitations.map((limitation) => (
        <li className="low" key={limitation}>
          {limitation}
        </li>
      ))}
    </ul>
  );
}
