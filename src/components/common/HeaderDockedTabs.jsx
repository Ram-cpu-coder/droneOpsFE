import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function HeaderDockedTabs({ children }) {
  const anchorRef = useRef(null);
  const dockedRef = useRef(false);
  const [header, setHeader] = useState(null);
  const [docked, setDocked] = useState(false);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const body = anchor.closest(".modal-body");
    const target = anchor.closest(".modal-dialog")?.querySelector(".modal-header");
    if (!body || !target) return undefined;
    setHeader(target);
    let settling = false;
    let frame;
    const transition = (next) => {
      if (next === dockedRef.current) return;
      dockedRef.current = next;
      settling = true;
      setDocked(next);
      // Header resizing can clamp scrollTop and emit another scroll event.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => { settling = false; });
      });
    };
    const update = () => {
      if (settling) return;
      if (dockedRef.current) {
        if (body.scrollTop <= 2) transition(false);
        return;
      }
      const threshold = anchor.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      if (body.scrollTop > threshold + 8) transition(true);
    };
    const handleWheel = (event) => {
      if (!settling && event.deltaY < 0 && body.scrollTop <= 2) transition(false);
    };
    body.addEventListener("scroll", update, { passive: true });
    body.addEventListener("wheel", handleWheel, { passive: true });
    body.classList.add("has-header-tabs");
    update();
    return () => {
      cancelAnimationFrame(frame);
      body.removeEventListener("scroll", update);
      body.removeEventListener("wheel", handleWheel);
      body.classList.remove("has-header-tabs");
    };
  }, []);

  useLayoutEffect(() => {
    if (!header || !docked) return undefined;
    header.classList.add("has-docked-tabs");
    return () => header.classList.remove("has-docked-tabs");
  }, [header, docked]);

  const row = <div className={`header-docked-tabs${docked ? " is-docked" : ""}`}>{children}</div>;
  return (
    <div ref={anchorRef} className="header-tabs-anchor">
      {docked && header ? createPortal(row, header) : row}
    </div>
  );
}
