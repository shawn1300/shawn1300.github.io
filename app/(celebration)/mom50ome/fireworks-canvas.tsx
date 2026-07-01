"use client";

import { useEffect, useRef } from "react";
import styles from "./page.module.css";

interface FireworkColor {
  r: number;
  g: number;
  b: number;
}

interface TrailPoint {
  x: number;
  y: number;
}

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: FireworkColor;
  gravity: number;
}

interface FireworkRocket {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  size: number;
  color: FireworkColor;
  trail: TrailPoint[];
  particles: FireworkParticle[];
  exploded: boolean;
}

interface CanvasSize {
  width: number;
  height: number;
}

const FIREWORK_COLORS: FireworkColor[] = [
  { r: 255, g: 226, b: 147 },
  { r: 255, g: 125, b: 104 },
  { r: 255, g: 168, b: 211 },
  { r: 151, g: 216, b: 255 },
  { r: 176, g: 238, b: 203 },
  { r: 255, g: 255, b: 238 },
];

const LAUNCH_INTERVAL_MS = 1100;
const MAX_ACTIVE_ROCKETS = 5;
const PARTICLE_COUNT_MIN = 34;
const PARTICLE_COUNT_MAX = 46;
const PARTICLE_TAIL_STEPS = 2;
const ROCKET_TRAIL_LENGTH = 18;

const randomBetween = (min: number, max: number) =>
  Math.random() * (max - min) + min;

const toRgba = (color: FireworkColor, alpha: number) =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;

const pickFireworkColor = () =>
  FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];

const createRocket = ({ width, height }: CanvasSize): FireworkRocket => {
  const targetX = randomBetween(width * 0.12, width * 0.88);
  const targetY = randomBetween(height * 0.12, height * 0.58);
  const startX = targetX + randomBetween(-width * 0.18, width * 0.18);
  const startY = height + randomBetween(18, 86);
  const distanceX = targetX - startX;
  const distanceY = targetY - startY;
  const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
  const speed = randomBetween(7.2, 9.4);

  return {
    x: startX,
    y: startY,
    targetX,
    targetY,
    vx: (distanceX / distance) * speed,
    vy: (distanceY / distance) * speed,
    size: randomBetween(2.2, 3.8),
    color: pickFireworkColor(),
    trail: [],
    particles: [],
    exploded: false,
  };
};

const explodeRocket = (rocket: FireworkRocket) => {
  rocket.exploded = true;
  rocket.particles = [];

  const count = Math.floor(
    randomBetween(PARTICLE_COUNT_MIN, PARTICLE_COUNT_MAX + 1),
  );

  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * (index / count) + randomBetween(-0.12, 0.12);
    const power = randomBetween(2.2, 5.7);
    const color = index % 5 === 0 ? pickFireworkColor() : rocket.color;
    const life = randomBetween(38, 58);

    rocket.particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      size: randomBetween(1.2, 2.9),
      life,
      maxLife: life,
      color,
      gravity: randomBetween(0.026, 0.046),
    });
  }
};

const updateRocket = (rocket: FireworkRocket) => {
  if (!rocket.exploded) {
    rocket.x += rocket.vx;
    rocket.y += rocket.vy;
    rocket.vy += 0.036;
    rocket.trail.push({ x: rocket.x, y: rocket.y });

    if (rocket.trail.length > ROCKET_TRAIL_LENGTH) {
      rocket.trail.shift();
    }

    if (rocket.y <= rocket.targetY || rocket.vy >= 0) {
      explodeRocket(rocket);
    }

    return;
  }

  rocket.particles.forEach((particle) => {
    particle.vy += particle.gravity;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.986;
    particle.vy *= 0.986;
    particle.life -= 1;
  });

  rocket.particles = rocket.particles.filter((particle) => particle.life > 0);
};

const drawCircle = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) => {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
};

const drawParticleTail = (
  ctx: CanvasRenderingContext2D,
  particle: FireworkParticle,
  alpha: number,
) => {
  const tailX = particle.x - particle.vx * PARTICLE_TAIL_STEPS * 4.2;
  const tailY = particle.y - particle.vy * PARTICLE_TAIL_STEPS * 4.2;

  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(particle.x, particle.y);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, particle.size * 1.6);
  ctx.strokeStyle = toRgba(particle.color, alpha * 0.5);
  ctx.stroke();
};

const drawRocket = (ctx: CanvasRenderingContext2D, rocket: FireworkRocket) => {
  if (!rocket.exploded) {
    rocket.trail.forEach((point, index) => {
      if (index === 0) return;

      const previous = rocket.trail[index - 1];
      const alpha = index / rocket.trail.length;

      ctx.beginPath();
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.lineCap = "round";
      ctx.lineWidth = 1 + alpha * 2.8;
      ctx.strokeStyle = toRgba(rocket.color, alpha * 0.78);
      ctx.stroke();
    });

    drawCircle(ctx, rocket.x, rocket.y, rocket.size * 2.4, toRgba(rocket.color, 0.22));
    drawCircle(ctx, rocket.x, rocket.y, rocket.size, toRgba({ r: 255, g: 255, b: 255 }, 0.92));
    return;
  }

  rocket.particles.forEach((particle, index) => {
    const alpha = Math.max(particle.life / particle.maxLife, 0);

    drawParticleTail(ctx, particle, alpha);

    if (index % 3 === 0) {
      drawCircle(
        ctx,
        particle.x,
        particle.y,
        particle.size * 2.4,
        toRgba(particle.color, alpha * 0.12),
      );
    }

    drawCircle(
      ctx,
      particle.x,
      particle.y,
      particle.size * 1.4,
      toRgba(particle.color, alpha * 0.86),
    );
  });
};

export function FireworksCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const launchClockRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const rocketsRef = useRef<FireworkRocket[]>([]);
  const sizeRef = useRef<CanvasSize>({ width: 375, height: 667 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    const resizeCanvas = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      sizeRef.current = { width, height };
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const launchRandomFirework = () => {
      const rockets = rocketsRef.current;

      if (rockets.length >= MAX_ACTIVE_ROCKETS) {
        rockets.shift();
      }

      rockets.push(createRocket(sizeRef.current));
    };

    const stop = () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      lastFrameRef.current = null;
    };

    const renderFrame = (time: number) => {
      const lastFrame = lastFrameRef.current ?? time;
      const delta = Math.min(time - lastFrame, 64);

      lastFrameRef.current = time;
      launchClockRef.current += delta;

      if (launchClockRef.current > LAUNCH_INTERVAL_MS) {
        launchRandomFirework();
        launchClockRef.current = 0;
      }

      ctx.fillStyle = "rgba(58, 2, 12, 0.22)";
      ctx.fillRect(0, 0, sizeRef.current.width, sizeRef.current.height);

      for (let index = rocketsRef.current.length - 1; index >= 0; index -= 1) {
        const rocket = rocketsRef.current[index];

        updateRocket(rocket);
        drawRocket(ctx, rocket);

        if (rocket.exploded && rocket.particles.length === 0) {
          rocketsRef.current.splice(index, 1);
        }
      }

      animationRef.current = window.requestAnimationFrame(renderFrame);
    };

    const start = () => {
      if (animationRef.current !== null || reducedMotion.matches) return;

      if (rocketsRef.current.length === 0) {
        launchRandomFirework();
        launchRandomFirework();
      }

      animationRef.current = window.requestAnimationFrame(renderFrame);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }

      start();
    };

    const handleReducedMotionChange = () => {
      if (reducedMotion.matches) {
        rocketsRef.current = [];
        ctx.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height);
        stop();
        return;
      }

      start();
    };

    resizeCanvas();
    start();

    window.addEventListener("resize", resizeCanvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotion.addEventListener("change", handleReducedMotionChange);

    return () => {
      stop();
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.fireworksCanvas} aria-hidden="true" />;
}
