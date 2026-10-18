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
        const gold = new THREE.MeshPhysicalMaterial({ color: 0xc49b50, metalness: 1, roughness: 0.2, clearcoat: 1 });
        const dark = new THREE.MeshPhysicalMaterial({ color: 0x14191e, metalness: 1, roughness: 0.17, clearcoat: 1 });
        const glow = new THREE.MeshBasicMaterial({ color: 0xffd78b });
        const wire = new THREE.LineBasicMaterial({ color: 0xd4ad68, transparent: true, opacity: 0.5 });
        const body = new THREE.Group();
        scene.add(body);
        const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.93, 2), dark);
        body.add(nucleus);
        const edgeGeometry = new THREE.IcosahedronGeometry(0.945, 1);
        body.add(new THREE.LineSegments(new THREE.EdgesGeometry(edgeGeometry), wire));
        edgeGeometry.dispose();
        const center = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), glow);
        center.position.set(0.23, 0.18, 0.87);
        body.add(center);
        const rings: import("three").Mesh[] = [];
        for (let i = 0; i < 5; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * 0.21, i % 2 ? 0.013 : 0.035, 8, 128), i === 3 ? glow : gold);
          ring.rotation.set(0.6 + i * 0.4, i * 0.6, i * 0.45);
          body.add(ring);
          rings.push(ring);
        }
        const satelliteGeometry = new THREE.SphereGeometry(0.07, 12, 8);
        for (let i = 0; i < 12; i++) {
          const satellite = new THREE.Mesh(satelliteGeometry, i % 3 ? gold : glow);
          const angle = i * Math.PI * 2 / 12;
          satellite.position.set(Math.cos(angle) * 2.2, Math.sin(angle) * 2.2, Math.sin(i * 2) * 0.45);
          body.add(satellite);
        }
        const positions = new Float32Array(90 * 3);
        for (let i = 0; i < 90; i++) {
          const angle = i * 2.399963;
          const radius = 2.4 + (i % 13) / 13 * 1.5;
          positions.set([Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(i * 1.7) - 1], i * 3);
        }
        const particles = new THREE.BufferGeometry();
        particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const particleMaterial = new THREE.PointsMaterial({ color: 0xd8b571, size: 0.016, transparent: true, opacity: 0.6 });
        scene.add(new THREE.Points(particles, particleMaterial));
        scene.add(new THREE.AmbientLight(0xffe0aa, 1));
        const key = new THREE.PointLight(0xffd9a0, 70, 20);
        key.position.set(3, 3, 4);
        scene.add(key);
        const rim = new THREE.PointLight(0xe5efff, 45, 20);
        rim.position.set(-3, 1, 2);
        scene.add(rim);
        function render() {
          const p = current.current;
          body.rotation.set(0.08 + p * 0.06, p * 0.18, -0.12 + p * 0.045);
          rings.forEach((ring, i) => { ring.rotation.z = i * 0.45 + p * (i % 2 ? -0.16 : 0.12); });
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
          [gold, dark, glow, wire, particleMaterial].forEach(material => material.dispose());
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
