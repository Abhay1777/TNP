import { Route } from "react-router";
import RequireRole from "../components/RequireRole";
import { ROLE_GROUPS } from "../lib/roles";
import StaffLayout from "../pages/staff/StaffLayout";
import StaffNotice from "../pages/staff/StaffNotice";
import PlacementCompany from "../pages/staff/placement_company";
import CompanyPage from "../pages/staff/placement_companies_view";
import ViewCompanyInfo from "../pages/staff/view-company-info";
import EditCompanyInfo from "../pages/staff/edit-comapny-info";
import StudentManager from "../pages/staff/student-management";
import SendPlacementMessage from "../pages/staff/SendPlacementMessage";
import InternshipCompanyRegister from "../pages/internship_officer/InternshipCompanyRegister";
import InternShipVerify from "../pages/internship_officer/InternShipVerify";
import BatchCategorizer from "../pages/staff/update-category-form";
const StaffRoutes = () => {
  return (
    <Route element={<RequireRole allowed={ROLE_GROUPS.PLACEMENT_DRIVE} />}>
      <Route path="/staff" element={<StaffLayout />}>
        <Route index element={<StaffNotice />} />
        <Route path="placement_companies" element={<CompanyPage />} />
        <Route
          path="placement_companies/register"
          element={<PlacementCompany />}
        />
        <Route path="placement_companies/view" element={<ViewCompanyInfo />} />
        <Route
          path="placement_companies/message"
          element={<SendPlacementMessage />}
        />
        <Route path="placement_companies/edit" element={<EditCompanyInfo />} />
        <Route
          path="internship/register"
          element={<InternshipCompanyRegister />}
        />
        <Route path="student-management" element={<StudentManager />} />
        <Route path="internship/verify" element={<InternShipVerify />} />
        <Route path="batch-categorize" element={<BatchCategorizer />} />
      </Route>
    </Route>
  );
};

export default StaffRoutes;
