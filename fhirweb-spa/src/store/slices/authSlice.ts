import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  user: {
    id: string;
    name: string;
  } | null;
  loading: boolean;
  error: string | null;
}

// Restore auth state from localStorage
const getInitialAuthState = (): AuthState => {
  try {
    const savedAuth = localStorage.getItem('auth_state');
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      return {
        ...parsed,
        loading: false,
      };
    }
  } catch (error) {
    console.error('Failed to restore auth state from localStorage:', error);
  }

  return {
    isAuthenticated: false,
    token: null,
    user: null,
    loading: false,
    error: null,
  };
};

const initialState: AuthState = getInitialAuthState();

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.loading = true;
      state.error = null;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{
        token: string;
        user: { id: string; name: string };
      }>,
    ) => {
      state.isAuthenticated = true;
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.loading = false;
      state.error = null;

      // Persist to localStorage
      try {
        localStorage.setItem(
          'auth_state',
          JSON.stringify({
            isAuthenticated: true,
            token: action.payload.token,
            user: action.payload.user,
            loading: false,
            error: null,
          }),
        );
      } catch (error) {
        console.error('Failed to persist auth state to localStorage:', error);
      }
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.isAuthenticated = false;
      state.loading = false;
      state.error = action.payload;
      localStorage.removeItem('auth_state');
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.token = null;
      state.user = null;
      localStorage.removeItem('auth_state');
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout } =
  authSlice.actions;

export default authSlice.reducer;
