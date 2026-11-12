import { Navigate, useParams } from "react-router-dom";
import { routes } from "../../../constants/routes";

/** Redirects the retired `/transactions/:id/edit` URL to the editable `/transactions/:id` view. */
export function TransactionEditRedirect() {
  const { id = "" } = useParams();
  return <Navigate replace to={routes.transaction(id)} />;
}
