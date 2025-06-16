import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { setUser } = useUser();

  const handleSubmit = (e) => {
    e.preventDefault();

    if (email && password) {
      setUser({ email }); // שמירת המשתמש
      navigate('/lobby');
    } else {
      alert('נא למלא את כל השדות');
    }
  };

  return (
    <div style={styles.container}>
      <h2>התחברות ל־Omaha Circle</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="email"
          placeholder="אימייל"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />
        <input
          type="password"
          placeholder="סיסמה"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.button}>
          התחבר
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '400px',
    margin: '100px auto',
    padding: '2rem',
    textAlign: 'center',
    border: '1px solid #ccc',
    borderRadius: '10px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  input: {
    padding: '0.5rem',
    fontSize: '1rem',
  },
  button: {
    padding: '0.7rem',
    fontSize: '1rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
};

export default Login;