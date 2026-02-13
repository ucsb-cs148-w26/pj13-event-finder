import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

test('renders event finder title', () => {
  render(<App />);
  const titleElement = screen.getByRole('heading', { level: 1 });
  expect(titleElement).toHaveTextContent('Event Finder');
});

test('state and city dropdown functionality', async () => {
  render(<App />);

  // Find the state input
  const stateInput = screen.getByPlaceholderText('Start typing a state (e.g., California)');

  // Type "Cal" to trigger state dropdown
  await userEvent.type(stateInput, 'Cal');

  // Find the dropdown list and then the California option within it
  const stateDropdown = await screen.findByRole('list');
  const californiaOption = await screen.findByText('California', { selector: 'li' });
  expect(californiaOption).toBeInTheDocument();

  // Click on California to select it
  await userEvent.click(californiaOption);

  // Check that state input now shows "California"
  expect(stateInput).toHaveValue('California');

  // Find the city input - it should now be enabled
  const cityInput = screen.getByPlaceholderText('City in California');
  expect(cityInput).not.toBeDisabled();

  // Type "Los" in city input to trigger city dropdown
  await userEvent.type(cityInput, 'Los');

  // Find the city dropdown option
  const losAngelesOption = await screen.findByText('Los Angeles, California', { selector: 'li' });
  expect(losAngelesOption).toBeInTheDocument();

  // Click on Los Angeles to select it
  await userEvent.click(losAngelesOption);

  // Check that city input now shows "Los Angeles"
  expect(cityInput).toHaveValue('Los Angeles');
});

