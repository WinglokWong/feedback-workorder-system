"use client";

type PaginationProps = {
  total:number;
  page:number;
  pageSize:number;
  onPageChange:(page:number) => void;
  onPageSizeChange:(size:number) => void;
};

export default function Pagination({ total, page, pageSize, onPageChange, onPageSizeChange }:PaginationProps) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  return (
    <nav className="pagination" aria-label="列表分页">
      <span className="pagination-range">显示 {start}–{end}，共 {total} 条</span>
      <label><span>每页</span><select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}><option value="5">5 条</option><option value="10">10 条</option><option value="20">20 条</option></select></label>
      <div className="pagination-controls"><button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>上一页</button><b>第 {safePage} / {pageCount} 页</b><button type="button" disabled={safePage >= pageCount} onClick={() => onPageChange(safePage + 1)}>下一页</button></div>
    </nav>
  );
}
