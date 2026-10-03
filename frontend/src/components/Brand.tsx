import markLight from '../assets/brand/logo-mark.png';
import markDark from '../assets/brand/logo-mark-dark.png';

/** The DS road monogram. Swap the two PNGs in assets/brand to change the logo everywhere. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <picture>
      <source srcSet={markDark} media="(prefers-color-scheme: dark)" />
      <img src={markLight} width={size} height={size} alt="" decoding="async" />
    </picture>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span>DriveShare</span>
    </span>
  );
}
