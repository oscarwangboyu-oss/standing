import { Fragment, type ReactNode } from 'react';

/**
 * Puts elements into a sentence from src/copy. "{code} leads at {price}." with
 * { code: <TapeCode />, price: '111.20' } gives the sentence with the chip in place.
 * A word in braces without a part is left out.
 */
export function fill(template: string, parts: Record<string, ReactNode>): ReactNode {
  return template
    .split(/(\{[a-z]+\})/)
    .filter((piece) => piece !== '')
    .map((piece, index) => {
      const name = /^\{([a-z]+)\}$/.exec(piece)?.[1];
      return <Fragment key={index}>{name ? (parts[name] ?? null) : piece}</Fragment>;
    });
}
