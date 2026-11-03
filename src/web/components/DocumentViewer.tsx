// Shows the original paper next to the reading, so a person can compare them.
export function DocumentViewer({ url, isPdf }: { url: string; isPdf: boolean }) {
  return isPdf ? (
    <iframe className="doc" src={`${url}#view=FitH`} title="Original document" />
  ) : (
    <div className="doc photo">
      <img src={url} alt="Original document" />
    </div>
  );
}
