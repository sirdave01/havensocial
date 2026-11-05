import { Bell, Home, LogOut, Search, UserRound, Users } from 'lucide-react';

export type NavIconName = 'home' | 'search' | 'profile' | 'notifications' | 'users' | 'logout';

const icons = {
  home: Home,
  search: Search,
  profile: UserRound,
  notifications: Bell,
  users: Users,
  logout: LogOut,
};

export default function NavIcon({ name }: { name: NavIconName }) {
  const Icon = icons[name];
  return (
    <Icon aria-hidden="true" focusable="false" />
  );
}
