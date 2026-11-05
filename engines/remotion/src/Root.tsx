import React from 'react';
import { Composition } from 'remotion';
import { Tutorial } from './Tutorial';
import type { Timeline } from '../../shared/types';

// Valores por defecto solo para Remotion Studio; el CLI siempre pasa el timeline real.
const placeholder = { fps: 30, width: 1920, height: 1080, duration: 5 } as unknown as Timeline;

export const Root: React.FC = () => (
  <Composition
    id="Tutorial"
    component={Tutorial as any}
    defaultProps={{ timeline: placeholder }}
    durationInFrames={150}
    fps={30}
    width={1920}
    height={1080}
    calculateMetadata={({ props }: any) => {
      const t = props.timeline as Timeline;
      return { durationInFrames: Math.ceil(t.duration * t.fps), fps: t.fps, width: t.width, height: t.height };
    }}
  />
);
