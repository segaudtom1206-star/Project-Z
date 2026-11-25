import { WeaponId } from '../game/types';

interface WeaponSilhouetteProps {
  weaponId: WeaponId;
  className?: string;
}

export function WeaponSilhouette({ weaponId, className = 'w-28 h-9' }: WeaponSilhouetteProps) {
  if (weaponId === 'AN_94') {
    return (
      <svg
        viewBox="0 0 140 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Stock */}
        <path d="M6 16L32 14L34 23L8 29L6 16Z" fill="currentColor" fillOpacity="0.88" />
        {/* Receiver */}
        <path d="M32 13H84L88 18V23H34V13Z" fill="currentColor" />
        {/* Grip */}
        <path d="M40 23H49L44 37H37L40 23Z" fill="currentColor" fillOpacity="0.9" />
        {/* Signature canted AN-94 magazine */}
        <path d="M64 23H74L80 40H70L64 23Z" fill="currentColor" fillOpacity="0.82" />
        {/* Handguard & barrel */}
        <path d="M84 14H112V20H88L84 14Z" fill="currentColor" fillOpacity="0.92" />
        <rect x="112" y="15" width="22" height="3.2" fill="currentColor" />
        {/* Iron sights */}
        <path d="M44 10H51V13H44V10Z" fill="currentColor" />
        <path d="M122 11H125V15H122V11Z" fill="currentColor" />
      </svg>
    );
  }

  if (weaponId === 'HAMR') {
    return (
      <svg
        viewBox="0 0 140 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Heavy LMG Stock */}
        <path d="M4 14H31V25L8 28L4 14Z" fill="currentColor" fillOpacity="0.88" />
        {/* Bulky SCAR/HAMR Upper Receiver */}
        <path d="M30 11H96V23H30V11Z" fill="currentColor" />
        {/* Pistol Grip */}
        <path d="M39 23H48L43 37H36L39 23Z" fill="currentColor" fillOpacity="0.9" />
        {/* Heavy Box/Drum Magazine */}
        <rect x="57" y="23" width="20" height="16" rx="1.5" fill="currentColor" fillOpacity="0.84" />
        <line x1="62" y1="26" x2="62" y2="36" stroke="#0d1115" strokeWidth="1.5" />
        <line x1="72" y1="26" x2="72" y2="36" stroke="#0d1115" strokeWidth="1.5" />
        {/* Vent Shroud & Heavy Barrel */}
        <rect x="96" y="13" width="18" height="7" fill="currentColor" fillOpacity="0.92" />
        <rect x="114" y="14.5" width="22" height="4" fill="currentColor" />
        {/* Rail & Bipod Stub */}
        <rect x="38" y="8" width="44" height="3" fill="currentColor" fillOpacity="0.7" />
        <path d="M98 20L106 29H101L94 20H98Z" fill="currentColor" fillOpacity="0.75" />
      </svg>
    );
  }

  // RAY GUN
  return (
    <svg
      viewBox="0 0 140 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Retro-atomic rear fin & dial */}
      <path d="M18 14C18 10 24 8 34 8H58V24H28C22 24 18 20 18 14Z" fill="currentColor" />
      <circle cx="34" cy="16" r="3.5" fill="#22e584" />
      {/* Ergonomic Grip */}
      <path d="M30 24H43L37 40H25L30 24Z" fill="currentColor" fillOpacity="0.9" />
      {/* Tapered Atomic Barrel */}
      <path d="M58 10L116 14V20L58 23V10Z" fill="currentColor" fillOpacity="0.92" />
      {/* Iconic Glowing Plasma Rings */}
      <rect x="68" y="9" width="4" height="15" rx="1" fill="#22e584" />
      <rect x="81" y="10" width="4" height="13" rx="1" fill="#22e584" />
      <rect x="94" y="11" width="3.5" height="11" rx="1" fill="#22e584" />
      {/* Emitter Dish Tip */}
      <path d="M116 12L126 17L116 22V12Z" fill="#22e584" />
      {/* Top Fin Sight */}
      <path d="M54 4L64 10H46L54 4Z" fill="currentColor" fillOpacity="0.8" />
    </svg>
  );
}
