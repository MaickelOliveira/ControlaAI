import localFont from "next/font/local";
import LandingCinematic from "@/components/landing/LandingCinematic";

const heading = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "600 800",
  display: "swap",
  variable: "--font-heading",
  fallback: ["Arial", "sans-serif"],
});

export default function Page() {
  return <LandingCinematic fontClass={heading.variable} />;
}
