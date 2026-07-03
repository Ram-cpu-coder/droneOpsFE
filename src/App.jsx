import { Navigate, Route, Routes } from "react-router-dom";
import { appRoutes } from "./routes/appRoutes.js";

function App() {
  return (
    <Routes>
      {appRoutes.map(({ path, component: Component }) => (
        <Route key={path} path={path} element={<Component />} />
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
