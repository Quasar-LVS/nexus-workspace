import React, { useRef, useState, useEffect } from "react";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  containerClassName?: string;
  onScrollNearTop?: () => void;
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  containerClassName = "h-[450px] overflow-y-auto scrollbar-thin space-y-4",
  onScrollNearTop
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(450);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const target = containerRef.current;
        setScrollTop(target.scrollTop);

        // If scroll hits near top, trigger loading callbacks
        if (target.scrollTop < 80 && onScrollNearTop) {
          onScrollNearTop();
        }
      }
    };

    const handleResize = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    const ref = containerRef.current;
    if (ref) {
      ref.addEventListener("scroll", handleScroll, { passive: true });
      handleResize();
      
      // Secondary check after layout settles
      setTimeout(handleResize, 100);
      
      window.addEventListener("resize", handleResize);
    }

    return () => {
      ref?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [onScrollNearTop]);

  const totalHeight = items.length * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight) + 4;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2);
  const endIndex = Math.min(items.length, startIndex + visibleCount);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div ref={containerRef} className={containerClassName}>
      <div style={{ height: totalHeight, position: "relative", width: "100%" }}>
        <div style={{ transform: `translateY(${offsetY}px)`, position: "absolute", left: 0, right: 0, top: 0 }}>
          {visibleItems.map((item, idx) => renderItem(item, startIndex + idx))}
        </div>
      </div>
    </div>
  );
}
