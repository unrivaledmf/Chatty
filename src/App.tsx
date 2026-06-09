import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/*" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}
