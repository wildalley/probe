import React from "react";

interface OsIconProps {
  os?: string;
  className?: string;
}

/**
 * Returns a high quality SVG icon matching the operating system / Linux distribution
 */
export const OsIcon: React.FC<OsIconProps> = ({ os = "", className = "h-4 w-4" }) => {
  const osLower = (os || "").toLowerCase();

  // Debian
  if (osLower.includes("debian")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "Debian"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#D70A53" fillOpacity="0.15" />
          <path
            d="M12.4 4.5c3.8.3 6.9 3.2 7.1 7 .2 3.8-2.6 7.1-6.4 7.5-3.8.4-7.2-2.3-7.6-6.1-.4-3.6 2.1-6.8 5.7-7.3 1.8-.3 3.6.3 4.9 1.5.3.3.4.7.1 1-.2.3-.7.3-1 .1-1.1-.9-2.5-1.4-4-1.2-2.9.4-5 2.9-4.7 5.8.3 3 2.9 5.3 5.9 5 2.9-.3 5.2-2.7 5.1-5.6-.1-2.8-2.2-5-5-5.3-2.1-.2-4.1.9-5 2.8-.2.4-.6.6-1 .4-.4-.2-.6-.6-.4-1 1.2-2.4 3.7-3.9 6.4-3.6 1.8.2 3.5 1.1 4.6 2.5z"
            fill="#D70A53"
          />
          <circle cx="12" cy="12" r="1.5" fill="#D70A53" />
        </svg>
      </span>
    );
  }

  // Ubuntu
  if (osLower.includes("ubuntu")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "Ubuntu"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#E95420" fillOpacity="0.18" />
          <circle cx="12" cy="12" r="6" stroke="#E95420" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="18" cy="12" r="1.8" fill="#E95420" />
          <circle cx="9" cy="6.8" r="1.8" fill="#E95420" />
          <circle cx="9" cy="17.2" r="1.8" fill="#E95420" />
        </svg>
      </span>
    );
  }

  // Arch Linux
  if (osLower.includes("arch")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "Arch Linux"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#1793D1" fillOpacity="0.18" />
          <path
            d="M12 5.5L7 17.5h2.2l1.2-3h3.2l1.2 3H17L12 5.5zm0 4.8l1.1 2.8h-2.2l1.1-2.8z"
            fill="#1793D1"
          />
        </svg>
      </span>
    );
  }

  // Alpine Linux
  if (osLower.includes("alpine")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "Alpine Linux"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#0D597F" fillOpacity="0.18" />
          <path
            d="M12 6L6.5 17h11L12 6zm0 3.8l3.3 6.2H8.7L12 9.8z"
            fill="#0D597F"
          />
        </svg>
      </span>
    );
  }

  // CentOS / RedHat / Rocky / Alma
  if (
    osLower.includes("centos") ||
    osLower.includes("rocky") ||
    osLower.includes("alma") ||
    osLower.includes("rhel") ||
    osLower.includes("red hat")
  ) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "CentOS/RHEL"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#EE0000" fillOpacity="0.12" />
          <rect x="7" y="7" width="4.5" height="4.5" rx="1" fill="#FFA800" />
          <rect x="12.5" y="7" width="4.5" height="4.5" rx="1" fill="#93227F" />
          <rect x="7" y="12.5" width="4.5" height="4.5" rx="1" fill="#262577" />
          <rect x="12.5" y="12.5" width="4.5" height="4.5" rx="1" fill="#2DBE26" />
        </svg>
      </span>
    );
  }

  // Fedora
  if (osLower.includes("fedora")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "Fedora"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" fill="#294172" fillOpacity="0.18" />
          <path
            d="M12 6c-3.3 0-6 2.7-6 6 0 2.2 1.2 4.1 3 5.1V14h-1v-2h1v-1c0-1.7 1.3-3 3-3h2v2h-2c-.6 0-1 .4-1 1v1h3v2h-3v4c2.8-.5 5-3 5-6 0-3.3-2.7-6-6-6z"
            fill="#51A2DA"
          />
        </svg>
      </span>
    );
  }

  // Windows
  if (osLower.includes("windows") || osLower.includes("win")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "Windows"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="4" y="4.5" width="7" height="6.5" fill="#00A4EF" />
          <rect x="13" y="4.5" width="7" height="6.5" fill="#00A4EF" />
          <rect x="4" y="13" width="7" height="6.5" fill="#00A4EF" />
          <rect x="13" y="13" width="7" height="6.5" fill="#00A4EF" />
        </svg>
      </span>
    );
  }

  // macOS / Darwin
  if (osLower.includes("darwin") || osLower.includes("macos") || osLower.includes("apple")) {
    return (
      <span className="inline-flex items-center shrink-0" title={os || "macOS"}>
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.88c.64-.78 1.08-1.86.96-2.95-1 .04-2.13.65-2.78 1.41-.57.65-1.07 1.76-.94 2.83 1.12.09 2.19-.58 2.76-1.29z" />
        </svg>
      </span>
    );
  }

  // Default Linux Penguin / Chip
  return (
    <span className="inline-flex items-center shrink-0" title={os || "Linux"}>
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" fill="#FCC624" fillOpacity="0.22" />
        <path
          d="M12 5c-2.2 0-4 1.8-4 4 0 1.2.5 2.2 1.3 3-.8 1-1.3 2.3-1.3 3.7 0 1.8 1.8 3.3 4 3.3s4-1.5 4-3.3c0-1.4-.5-2.7-1.3-3.7.8-.8 1.3-1.8 1.3-3 0-2.2-1.8-4-4-4zm-1.2 3.5c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7zm2.4 0c.4 0 .7.3.7.7s-.3.7-.7.7-.7-.3-.7-.7.3-.7.7-.7zm-1.2 2c.6 0 1.1.2 1.4.5-.4.3-.9.5-1.4.5s-1-.2-1.4-.5c.3-.3.8-.5 1.4-.5z"
          fill="#FCC624"
        />
      </svg>
    </span>
  );
};
