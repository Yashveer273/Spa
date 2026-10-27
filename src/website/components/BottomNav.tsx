import { NavLink } from 'react-router-dom';
import { Icon } from './Icon';

/** The bottom bar (floating pill on desktop, full-width bar on phones). */
export function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end className={cls}><Icon name="home" />Home</NavLink>
      <NavLink to="/bookings" className={cls}><Icon name="calendar" />Bookings</NavLink>
      <NavLink to="/book-now" className={({ isActive }) => `nav-book ${isActive ? 'active' : ''}`}>
        <span><Icon name="bookNow" /></span>Book Now
      </NavLink>
      <NavLink to="/offers" className={cls}><Icon name="tag" />Offers</NavLink>
      <NavLink to="/login" className={cls}><Icon name="user" />Profile</NavLink>
    </nav>
  );
}
