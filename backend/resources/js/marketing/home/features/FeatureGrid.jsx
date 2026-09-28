import React from "react";
import useScene, { trackGlow } from "./useScene.js";
import { TILES } from "./featureTiles.js";

/* Two even columns of cards: a framed live scene, then a name and one line.
 * `only` narrows the grid to a single card for local previews. */
function Tile({ tile, index }) {
    const ref = useScene();
    const Scene = tile.Scene;
    return (
        <article ref={ref} className={`fx-tile fx-tile-${tile.id}`} style={{ "--i": index % 2 }}>
            <div className="fx-art" aria-hidden="true">
                <Scene />
            </div>
            <div className="fx-copy">
                <h3>{tile.title}</h3>
                <p>{tile.copy}</p>
            </div>
        </article>
    );
}

export default function FeatureGrid({ only = null }) {
    const tiles = only ? TILES.filter((tile) => tile.id === only) : TILES;
    return (
        <div className="fx-grid" onPointerMove={trackGlow}>
            {tiles.map((tile, index) => (
                <Tile tile={tile} index={index} key={tile.id} />
            ))}
        </div>
    );
}
