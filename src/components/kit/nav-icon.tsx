import {
  BarChart3,
  Boxes,
  Building2,
  Circle,
  ClipboardCheck,
  Factory,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  Lock,
  Map,
  ShieldCheck,
  Truck,
  UserSquare2,
  Users,
  Wallet,
  Wrench,
  CircuitBoard,
} from "lucide-react";

/**
 * Curated set of lucide-react icons the nav registry may reference. Add an
 * entry to both this list and the `NavIcon` switch below before an admin can
 * select a new icon — keeps the picker small and the bundle predictable.
 */
export const NAV_ICON_NAMES = [
  "LayoutDashboard",
  "Wrench",
  "ShieldCheck",
  "Users",
  "Building2",
  "Factory",
  "BarChart3",
  "ClipboardCheck",
  "Boxes",
  "Layers",
  "LayoutGrid",
  "Map",
  "Wallet",
  "Truck",
  "UserSquare2",
  "Lock",
  "KeyRound",
  "CircuitBoard",
] as const;

/**
 * Renders a curated nav icon by name via a switch over static JSX tags
 * (deliberately not a dynamic `const Icon = lookup(name)` component
 * variable): the React Compiler's `static-components` lint rule forbids
 * resolving a component reference at render time and using it as a JSX tag,
 * even memoized. Falls back to a generic dot for an unrecognized name.
 */
export function NavIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  switch (name) {
    case "LayoutDashboard":
      return <LayoutDashboard className={className} />;
    case "CircuitBoard":
      return <CircuitBoard className={className} />;
    case "Wrench":
      return <Wrench className={className} />;
    case "ShieldCheck":
      return <ShieldCheck className={className} />;
    case "Users":
      return <Users className={className} />;
    case "Building2":
      return <Building2 className={className} />;
    case "Factory":
      return <Factory className={className} />;
    case "BarChart3":
      return <BarChart3 className={className} />;
    case "ClipboardCheck":
      return <ClipboardCheck className={className} />;
    case "Boxes":
      return <Boxes className={className} />;
    case "Layers":
      return <Layers className={className} />;
    case "LayoutGrid":
      return <LayoutGrid className={className} />;
    case "Map":
      return <Map className={className} />;
    case "Wallet":
      return <Wallet className={className} />;
    case "Truck":
      return <Truck className={className} />;
    case "UserSquare2":
      return <UserSquare2 className={className} />;
    case "Lock":
      return <Lock className={className} />;
    case "KeyRound":
      return <KeyRound className={className} />;
    default:
      return <Circle className={className} />;
  }
}
