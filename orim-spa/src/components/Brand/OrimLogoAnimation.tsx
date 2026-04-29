import { useCallback, useRef } from 'react';

const css = `
  .orim-anim-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  }
  .orim-anim-row {
    display: flex;
    align-items: center;
    gap: 32px;
  }
  .orim-anim-icon {
    position: relative;
    width: 110px;
    height: 110px;
  }
  .orim-anim-border-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .orim-anim-border-rect {
    fill: none;
    stroke: url(#orimBorderGrad);
    stroke-width: 5;
    stroke-dasharray: 408;
    stroke-dashoffset: 408;
    animation: orimDrawBorder 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.1s forwards;
  }
  @keyframes orimDrawBorder {
    to { stroke-dashoffset: 0; }
  }
  .orim-anim-grid {
    position: absolute;
    inset: 14px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 8px;
  }
  .orim-anim-sq {
    border-radius: 8px;
    transform: scale(0);
    transform-origin: center;
  }
  .orim-anim-sq-orange {
    background: #FF6B2B;
    animation: orimPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.75s forwards;
  }
  .orim-anim-sq-pink {
    background: #E8336D;
    animation: orimPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.92s forwards;
  }
  .orim-anim-sq-purple {
    background: #7B35D4;
    animation: orimPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 1.09s forwards;
  }
  .orim-anim-sq-cursor {
    background: rgba(255,255,255,0);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(1);
    animation: orimFadeIn 0.4s ease 1.3s forwards;
  }
  @keyframes orimPopIn {
    from { transform: scale(0); }
    to   { transform: scale(1); }
  }
  @keyframes orimFadeIn {
    to { opacity: 1; }
  }
  .orim-anim-sheen-wrap {
    position: absolute;
    inset: 0;
    border-radius: 25px;
    overflow: hidden;
    pointer-events: none;
  }
  .orim-anim-sheen {
    position: absolute;
    top: -60%;
    left: -80%;
    width: 55%;
    height: 220%;
    background: linear-gradient(
      105deg,
      transparent 0%,
      rgba(255,255,255,0.0) 35%,
      rgba(255,255,255,0.55) 50%,
      rgba(255,255,255,0.0) 65%,
      transparent 100%
    );
    transform: skewX(-15deg);
    opacity: 0;
    animation: orimSheenSlide 0.7s cubic-bezier(0.4, 0, 0.2, 1) 2.5s forwards;
  }
  @keyframes orimSheenSlide {
    0%   { left: -80%; opacity: 1; }
    100% { left: 130%; opacity: 1; }
  }
  .orim-anim-wordmark {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }
  .orim-anim-letters {
    display: flex;
    gap: 0;
    line-height: 1;
  }
  .orim-anim-letters span {
    display: inline-block;
    font-size: 80px;
    font-weight: 800;
    color: #1a1a1a;
    letter-spacing: -2px;
    opacity: 0;
    transform: translateY(18px);
  }
  .orim-anim-letters span:nth-child(1) { animation: orimLetterUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 1.4s forwards; }
  .orim-anim-letters span:nth-child(2) { animation: orimLetterUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 1.52s forwards; }
  .orim-anim-letters span:nth-child(3) { animation: orimLetterUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 1.64s forwards; }
  .orim-anim-letters span:nth-child(4) { animation: orimLetterUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) 1.76s forwards; }
  @keyframes orimLetterUp {
    to { opacity: 1; transform: translateY(0); }
  }
  .orim-anim-underline-wrap {
    height: 5px;
    overflow: hidden;
  }
  .orim-anim-underline-bar {
    height: 5px;
    width: 80px;
    border-radius: 3px;
    background: linear-gradient(90deg, #FF6B2B 0%, #E8336D 60%, #7B35D4 100%);
    transform: scaleX(0);
    transform-origin: left;
    animation: orimDrawLine 0.5s cubic-bezier(0.22, 1, 0.36, 1) 2.1s forwards;
  }
  @keyframes orimDrawLine {
    to { transform: scaleX(1); }
  }
  .orim-anim-wordmark-sheen {
    position: absolute;
    top: -10%;
    left: -60%;
    width: 40%;
    height: 120%;
    background: linear-gradient(
      105deg,
      transparent 0%,
      rgba(255,255,255,0.0) 30%,
      rgba(255,255,255,0.45) 50%,
      rgba(255,255,255,0.0) 70%,
      transparent 100%
    );
    transform: skewX(-15deg);
    opacity: 0;
    animation: orimSheenSlide 0.65s cubic-bezier(0.4, 0, 0.2, 1) 2.62s forwards;
  }
  .orim-anim-subtitle {
    font-size: 22px;
    font-weight: 400;
    color: #888;
    letter-spacing: 0.01em;
    opacity: 0;
    animation: orimFadeIn 0.6s ease 2.35s forwards;
  }
`;

interface OrimLogoAnimationProps {
  subtitle?: string;
}

export function OrimLogoAnimation({ subtitle }: OrimLogoAnimationProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const replay = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    el.parentNode?.replaceChild(clone, el);
    (wrapRef as React.MutableRefObject<HTMLDivElement>).current = clone as HTMLDivElement;
  }, []);

  return (
    <>
      <style>{css}</style>
      <div ref={wrapRef} className="orim-anim-wrap" onDoubleClick={replay}>
        <div className="orim-anim-row">
          <div className="orim-anim-icon">
            <svg className="orim-anim-border-svg" viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="orimBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stopColor="#FF6B2B"/>
                  <stop offset="50%"  stopColor="#E8336D"/>
                  <stop offset="100%" stopColor="#7B35D4"/>
                </linearGradient>
              </defs>
              <rect className="orim-anim-border-rect" x="3" y="3" width="104" height="104" rx="25" ry="25"/>
            </svg>

            <div className="orim-anim-sheen-wrap">
              <div className="orim-anim-sheen" />
            </div>

            <div className="orim-anim-grid">
              <div className="orim-anim-sq orim-anim-sq-orange" />
              <div className="orim-anim-sq orim-anim-sq-pink" />
              <div className="orim-anim-sq orim-anim-sq-purple" />
              <div className="orim-anim-sq orim-anim-sq-cursor">
                <svg width="34" height="34" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="4,2 4,20 8,15 11,22 14,21 11,14 17,14" fill="#1c1c1e" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <div className="orim-anim-wordmark">
            <div className="orim-anim-letters">
              <span>O</span><span>R</span><span>I</span><span>M</span>
            </div>
            <div className="orim-anim-underline-wrap">
              <div className="orim-anim-underline-bar" />
            </div>
            <div className="orim-anim-wordmark-sheen" />
          </div>
        </div>

        {subtitle && <div className="orim-anim-subtitle">{subtitle}</div>}
      </div>
    </>
  );
}
