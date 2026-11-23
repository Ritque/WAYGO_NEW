import React from 'react';

interface WayGoLogoProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export const WayGoLogo: React.FC<WayGoLogoProps> = ({
  className = '',
  width = 175,
  height = 72
}) => {
  return (
    <div className={`inline-flex items-center justify-center select-none ${className}`} style={{ width, height }}>
      <svg
        viewBox="0 0 175 72"
        role="img"
        aria-label="WayGo logo"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible block"
      >
        <path
          d="M 51 57 C 37 56, 30 48, 31 39 C 32 23, 48 18, 67 18 C 90 17, 113 18, 132 17"
          fill="none"
          stroke="#21a65b"
          strokeWidth="4.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 126 11 L 135 17 L 126 23"
          fill="none"
          stroke="#21a65b"
          strokeWidth="4.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="46"
          y="49"
          fill="#ffffff"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="26"
          fontWeight="900"
          letterSpacing="-1.8"
        >
          WAY
        </text>
        <text
          x="108"
          y="49"
          fill="#21a65b"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="26"
          fontWeight="900"
          letterSpacing="-1.2"
        >
          GO
        </text>
      </svg>
    </div>
  );
};
