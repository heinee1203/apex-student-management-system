import { useNavigate } from 'react-router-dom';
import PinDialog from './PinDialog';

// This wraps a page component and requires PIN before rendering it
export default function PinGate({ children, unlocked, setUnlocked }) {
  const navigate = useNavigate();

  if (unlocked) return children;

  return (
    <PinDialog
      onSuccess={() => setUnlocked(true)}
      onCancel={() => navigate('/')}
    />
  );
}
