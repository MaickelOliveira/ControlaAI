"use client";

import { useEffect, useRef } from "react";
import s from "./landing.module.css";

/** A real WebGL object. No animation loop: scrolling is the only clock. */
export default function ZeloCore({ position, enabled }: { position: number; enabled: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(position);
  const draw = useRef<(() => void) | null>(null);

  useEffect(() => { current.current = position; draw.current?.(); }, [position]);

  useEffect(() => {
    const element = host.current;
    if (!element || !enabled) return;
    let cancelled = false;
    let release: (() => void) | undefined;

    async function setup() {
      try {
        const THREE = await import("three");
        const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
        if (cancelled || !element) return;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.55;
        element.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
        camera.position.set(0, 0.1, 9);
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        const environment = pmrem.fromScene(room, 0.04);
        scene.environment = environment.texture;
        room.dispose();
        pmrem.dispose();
        const chrome = new THREE.MeshPhysicalMaterial({ color: 0xdde0df, metalness: 1, roughness: 0.13, clearcoat: 1 });
        const yellow = new THREE.MeshPhysicalMaterial({ color: 0xffdf00, metalness: 0.45, roughness: 0.24, clearcoat: 1 });
        const body = new THREE.Group();
        scene.add(body);
        const ribbon = new THREE.Mesh(new THREE.TorusKnotGeometry(1.7, 0.23, 180, 20, 2, 3), chrome);
        body.add(ribbon);
        const accent = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.045, 12, 160), yellow);
        accent.rotation.set(0.85, 0.4, 0.2);
        body.add(accent);
        scene.add(new THREE.AmbientLight(0xffffff, 2));
        const key = new THREE.PointLight(0xffffff, 85, 20);
        key.position.set(3, 3, 4);
        scene.add(key);
        const rim = new THREE.PointLight(0xffef88, 60, 20);
        rim.position.set(-3, 1, 2);
        scene.add(rim);
        function render() {
          const p = current.current;
          body.rotation.set(0.08 + p * 0.06, p * 0.18, -0.12 + p * 0.045);
          accent.rotation.z = 0.2 + p * 0.1;
          renderer.render(scene, camera);
        }
        const resize = () => {
          const { width, height } = element!.getBoundingClientRect();
          if (!width || !height) return;
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          render();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        const onLost = (event: Event) => { event.preventDefault(); element.dataset.ready = "false"; };
        const onRestored = () => { element.dataset.ready = "true"; render(); };
        renderer.domElement.addEventListener("webglcontextlost", onLost);
        renderer.domElement.addEventListener("webglcontextrestored", onRestored);
        draw.current = render;
        resize();
        element.dataset.ready = "true";
        release = () => {
          draw.current = null;
          observer.disconnect();
          renderer.domElement.removeEventListener("webglcontextlost", onLost);
          renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
          const geometries = new Set<import("three").BufferGeometry>();
          scene.traverse(object => { if ("geometry" in object) geometries.add(object.geometry as import("three").BufferGeometry); });
          geometries.forEach(geometry => geometry.dispose());
          [chrome, yellow].forEach(material => material.dispose());
          environment.dispose();
          renderer.dispose();
          renderer.domElement.remove();
          element.dataset.ready = "false";
        };
      } catch {
        // The CSS core remains visible when WebGL is unavailable.
        if (element) element.dataset.ready = "false";
      }
    }
    void setup();
    return () => { cancelled = true; release?.(); };
  }, [enabled]);

  return <div ref={host} className={s.core} aria-hidden="true"><div className={s.coreFallback}><i /><i /><i /><b>z</b></div></div>;
}
