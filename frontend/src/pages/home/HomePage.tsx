import { useAuth } from '../../context/AuthContext';
import AdminHome from './AdminHome';
import DebtorHome from './DebtorHome';

/** Same route, two audiences: the lender's portfolio dashboard, or a debtor's own debts. */
const HomePage = () => {
  const { user } = useAuth();
  return user?.role === 'admin' ? <AdminHome /> : <DebtorHome />;
};

export default HomePage;
