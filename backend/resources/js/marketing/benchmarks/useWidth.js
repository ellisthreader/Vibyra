import { useEffect, useRef, useState } from "react";

// Charts draw at their real pixel width so text never scales with the SVG.
export default function useWidth(initial = 960) {
    const ref = useRef(null);
    const [width, setWidth] = useState(initial);
    useEffect(() => {
        if (!ref.current) return undefined;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}
