import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Lobby from './pages/Lobby';
import Table from './pages/Table';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/lobby" element={<Lobby />} />
      <Route path="/table/:tableId" element={<Table />} />
    </Routes>
  );
}

export default App;