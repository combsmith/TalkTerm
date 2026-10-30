import { useEffect, useState, type ReactElement } from 'react';

interface CaptionBarProps {
  text: string | null;
  visible: boolean;
}

export function CaptionBar({ text, visible }: CaptionBarProps): ReactElement | null {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible && text !== null && text !== '') {
      setShow(true);
    } else if (!visible) {
      const timer = setTimeout(() => {
        setShow(false);
      }, 3000);
      return () => {
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [visible, text]);

  if (!show || text === null || text === '') return null;

  return (
    <div
      className={`mx-auto max-w-[500px] rounded-lg px-4 py-2 text-center backdrop-blur-sm transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
    >
      <p className="text-[14px] leading-5 text-text-on-dark">{text}</p>
    </div>
  );
}
