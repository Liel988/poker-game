import { useUser } from '../context/UserContext';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

function Lobby() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);

  const handleCreateTable = () => {
    const newTableId = crypto.randomUUID(); // מייצר מזהה ייחודי
    setTables([...tables, newTableId]);
    navigate(`/table/${newTableId}`);
  };

  return (
    <div style={styles.container}>
      <h2>לובי</h2>
      <p>שלום, {user?.email}</p>

      <button onClick={handleCreateTable} style={styles.button}>
        פתח שולחן חדש
      </button>

      <h3>שולחנות פעילים:</h3>
      <ul>
        {tables.map((tableId) => (
          <li key={tableId}>
            <a href={`/table/${tableId}`}>שולחן {tableId.slice(0, 8)}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    textAlign: 'center',
  },
  button: {
    padding: '1rem',
    fontSize: '1rem',
    backgroundColor: 'green',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    marginBottom: '1rem',
    cursor: 'pointer',
  },
};

export default Lobby;