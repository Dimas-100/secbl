// The signature Sleek Broadcast move: every member page opens with a felt
// gradient band. Pages overlap their first card onto it with -mt-3.
export function HeroBand({
  title,
  children,
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="hero-gradient -mx-4 rounded-b-2xl px-5 pt-4 pb-7 text-white">
      {title && <h1 className="text-lg font-extrabold">{title}</h1>}
      {children}
    </div>
  );
}
