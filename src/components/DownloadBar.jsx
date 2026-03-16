import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function DownloadBar({ photos }) {
  const donePhotos = photos.filter((p) => p.status === 'done' && p.processedCanvas);

  async function downloadAll() {
    const zip = new JSZip();
    const folder = zip.folder('privacy-photos');

    await Promise.all(
      donePhotos.map(
        (photo) =>
          new Promise((resolve) => {
            photo.processedCanvas.toBlob((blob) => {
              folder.file(`privacy_${photo.file.name}`, blob);
              resolve();
            }, 'image/jpeg', 0.92);
          })
      )
    );

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'privacy-photos.zip');
  }

  if (donePhotos.length === 0) return null;

  return (
    <div className="download-bar">
      <span className="download-bar__count">{donePhotos.length} photo{donePhotos.length !== 1 ? 's' : ''} ready</span>
      <button className="btn btn--primary" onClick={downloadAll}>
        ⬇ Download All (ZIP)
      </button>
    </div>
  );
}
