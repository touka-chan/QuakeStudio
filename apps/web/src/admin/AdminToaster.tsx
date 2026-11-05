import { Toaster as HotToaster } from 'react-hot-toast';

export function Toaster() {
  return (
    <HotToaster
      position="bottom-right"
      gutter={8}
      containerStyle={{
        bottom: 24,
        right: 24,
      }}
      toastOptions={{
        duration: 3000,
        style: {
          fontSize: '0.875rem',
          borderRadius: '0.5rem',
          padding: '0.75rem 1rem',
        },
      }}
    />
  );
}
