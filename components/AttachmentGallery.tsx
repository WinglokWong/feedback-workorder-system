"use client";

import { useEffect, useState } from "react";
import type { TicketAttachment } from "../lib/tickets";

const sizeFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits:1 });
function fileSize(bytes:number) {
  return bytes < 1024 * 1024 ? `${sizeFormatter.format(bytes / 1024)} KB` : `${sizeFormatter.format(bytes / 1024 / 1024)} MB`;
}

export default function AttachmentGallery({ attachments }:{ attachments:TicketAttachment[] }) {
  const images = attachments.filter((file) => file.contentType.startsWith("image/"));
  const [preview, setPreview] = useState<TicketAttachment | null>(null);
  const [viewMode, setViewMode] = useState<"fit"|"actual">("fit");
  const previewIndex = preview ? images.findIndex((file) => file.id === preview.id) : -1;
  function openPreview(file:TicketAttachment) { setViewMode("fit"); setPreview(file); }
  function switchImage(offset:number) {
    if (previewIndex < 0 || images.length < 2) return;
    setPreview(images[(previewIndex + offset + images.length) % images.length]);
  }

  useEffect(() => {
    if (!preview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyboard = (event:KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
      if (event.key === "ArrowLeft") switchImage(-1);
      if (event.key === "ArrowRight") switchImage(1);
    };
    window.addEventListener("keydown", handleKeyboard);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyboard); };
  }, [preview]);

  return (
    <>
      <div className="attachments">
        {attachments.map((file) => file.contentType.startsWith("image/") ? (
          <button className="image-attachment" type="button" onClick={() => openPreview(file)} key={file.id} aria-label={`查看原图：${file.fileName}`}>
            <img src={`/api/attachments/${file.id}`} alt={file.fileName} />
            <span><b>{file.fileName}</b><small>点击查看原图</small></span>
          </button>
        ) : (
          <a className="file-attachment" href={`/api/attachments/${file.id}`} key={file.id}>
            <span className="file-icon">件</span><span><b>{file.fileName}</b><small>{fileSize(file.size)}</small></span><i>下载</i>
          </a>
        ))}
      </div>
      {preview && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`原图预览：${preview.fileName}`} onClick={() => setPreview(null)}>
          <div className="lightbox-toolbar" onClick={(event) => event.stopPropagation()}><div><button className={viewMode === "fit" ? "is-active" : ""} type="button" onClick={() => setViewMode("fit")}>适应屏幕</button><button className={viewMode === "actual" ? "is-active" : ""} type="button" onClick={() => setViewMode("actual")}>原始尺寸</button><a href={`/api/attachments/${preview.id}`} download={preview.fileName}>下载原图</a>{images.length > 1 && <><span className="lightbox-divider" aria-hidden="true" /><button type="button" onClick={() => switchImage(-1)} aria-label="查看上一张图片">← 上一张</button><button type="button" onClick={() => switchImage(1)} aria-label="查看下一张图片">下一张 →</button></>}</div><div className="lightbox-toolbar-end">{images.length > 1 && <span className="lightbox-counter">{previewIndex + 1} / {images.length}</span>}<button type="button" onClick={() => setPreview(null)} aria-label="关闭原图预览">关闭</button></div></div>
          <div className="lightbox-viewport">
            <figure className={viewMode === "actual" ? "is-actual" : "is-fit"} onClick={(event) => event.stopPropagation()}>
              <img src={`/api/attachments/${preview.id}`} alt={preview.fileName} />
              <figcaption>{images.length > 1 ? `${previewIndex + 1} / ${images.length} · ` : ""}{preview.fileName}{viewMode === "actual" ? " · 原始像素，可滚动查看" : ""}</figcaption>
            </figure>
          </div>
        </div>
      )}
    </>
  );
}
