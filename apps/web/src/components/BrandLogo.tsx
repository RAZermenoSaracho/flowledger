type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "h-12 w-auto" }: BrandLogoProps) {
  return <img className={className} src="/logo.svg" alt="" aria-hidden="true" />;
}
