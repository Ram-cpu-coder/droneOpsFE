import { createSlice } from "@reduxjs/toolkit";

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    activeRoute: "home"
  },
  reducers: {
    routeChanged(state, action) {
      state.activeRoute = action.payload;
    }
  }
});

export const { routeChanged } = uiSlice.actions;
export default uiSlice.reducer;
