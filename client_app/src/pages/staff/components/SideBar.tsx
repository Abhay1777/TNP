import { NavLink } from "react-router"; // Import Link for routing
import "../../placement_officer/components/sidebar.css";
import { Building2, NotebookPen, Send, Verified } from "lucide-react";
import { logout, redirectToProfile } from "@/utils";
import { SERVER_URL } from "@/constant";
import Logo from "@/assets/img/logo.png";
import ProfileIcon from "@/assets/img/user_profile.png";
import LogoutIcon from "@/assets/img/logout.png";
const Sidebar = () => {
  const handleLogout = async () => {
    await logout();
    window.location.href = `${SERVER_URL}/auth/login/`;
  };
  return (
    <aside className="sidebar">
      <div className="logo-container">
        <img src={Logo} alt="TCET Logo" className="logo" />
        <h1 className="title">TCET - TNP</h1>
      </div>
      <ul className="menu">
        <NavLink to="" className="menu-item gap-3">
          <NotebookPen />
          <p>Notice Creation</p>
        </NavLink>
        <NavLink to="placement_companies" className="menu-item gap-3">
          <Building2 />
          <p>Placement Companies</p>
        </NavLink>
        <NavLink to="internship/register" className="menu-item gap-3">
          <Building2 />
          <p>InternShip Company Form</p>
        </NavLink>
        <NavLink to="internship/verify" className="menu-item gap-3">
          <Verified />
          <p>Verify Internship</p>
        </NavLink>
        <NavLink to="student-management" className="menu-item gap-3">
          <Verified />
          <p>Student Management</p>
        </NavLink>
        <NavLink to="batch-categorize" className="menu-item gap-3">
          <Verified />
          <p>Student Category</p>
        </NavLink>
        <NavLink to="/notifications/create" className="menu-item gap-3">
          <Send />
          <p>Notification</p>
        </NavLink>
      </ul>
      <div className="bottom-menu">
        <button
          className="profile-icon bg-transparent hover:bg-transparent"
          onClick={redirectToProfile}
        >
          <img src={ProfileIcon} alt="Profile" />
        </button>
        <button
          className="logout-icon bg-transparent hover:bg-transparent"
          onClick={handleLogout}
        >
          <img src={LogoutIcon} alt="Logout" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
