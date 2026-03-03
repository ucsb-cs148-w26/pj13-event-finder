import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchPanel from "./components/searchPanel";

test("does not allow more than 4 digits in the start date year", async () => {
  render(<SearchPanel onSearch={jest.fn()} loading={false} />);

  const startDateInput = screen.getByLabelText(/start date/i);

  // Type 5 digits into the year portion as a user would.
  await userEvent.type(startDateInput, "99999");

  // The input should only contain 4 digits for the year.
  expect(startDateInput).toHaveValue("9999");
});