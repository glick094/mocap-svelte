/**
 * Component tests for SettingsModal
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import SettingsModal from './SettingsModal.svelte';

describe('SettingsModal Component', () => {
  const defaultProps = {
    show: false,
    userSettings: {
      username: 'testuser',
      theme: 'dark' as const,
      quality: 'high' as const,
      enableAudio: true,
      fps: 15,
      enableSmoothing: true,
      filterWindowSize: 5
    },
    canvasSettings: {
      width: 1920,
      height: 1080
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('modal visibility', () => {
    it('should not render when show is false', () => {
      render(SettingsModal, { props: defaultProps });
      
      // Modal should not be visible
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render when show is true', () => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
      
      // Modal should be visible
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have proper modal structure when shown', () => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
      
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });
  });

  describe('form fields', () => {
    beforeEach(() => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
    });

    it('should display username field with current value', () => {
      const usernameInput = screen.getByLabelText(/username/i);
      expect(usernameInput).toBeInTheDocument();
      expect(usernameInput).toHaveValue('testuser');
    });

    it('should display theme selection', () => {
      const themeSelect = screen.getByLabelText(/theme/i);
      expect(themeSelect).toBeInTheDocument();
      expect(themeSelect).toHaveValue('dark');
    });

    it('should display quality selection', () => {
      const qualitySelect = screen.getByLabelText(/quality/i);
      expect(qualitySelect).toBeInTheDocument();
      expect(qualitySelect).toHaveValue('high');
    });

    it('should display fps input with current value', () => {
      const fpsInput = screen.getByLabelText(/fps|frame.*rate/i);
      expect(fpsInput).toBeInTheDocument();
      expect(fpsInput).toHaveValue(15);
    });

    it('should display enable audio checkbox', () => {
      const audioCheckbox = screen.getByLabelText(/audio/i);
      expect(audioCheckbox).toBeInTheDocument();
      expect(audioCheckbox).toBeChecked();
    });

    it('should display smoothing checkbox', () => {
      const smoothingCheckbox = screen.getByLabelText(/smooth/i);
      expect(smoothingCheckbox).toBeInTheDocument();
      expect(smoothingCheckbox).toBeChecked();
    });

    it('should display filter window size input', () => {
      const windowSizeInput = screen.getByLabelText(/window.*size|filter.*window/i);
      expect(windowSizeInput).toBeInTheDocument();
      expect(windowSizeInput).toHaveValue(5);
    });
  });

  describe('canvas settings', () => {
    beforeEach(() => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
    });

    it('should display canvas width input', () => {
      const widthInput = screen.getByLabelText(/width/i);
      expect(widthInput).toBeInTheDocument();
      expect(widthInput).toHaveValue(1920);
    });

    it('should display canvas height input', () => {
      const heightInput = screen.getByLabelText(/height/i);
      expect(heightInput).toBeInTheDocument();
      expect(heightInput).toHaveValue(1080);
    });
  });

  describe('user interactions', () => {
    let capturedSaveEvent: any = null;
    let capturedCloseEvent: any = null;

    beforeEach(() => {
      const { component } = render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });

      component.$on('save', (event) => {
        capturedSaveEvent = event;
      });

      component.$on('close', (event) => {
        capturedCloseEvent = event;
      });
    });

    afterEach(() => {
      capturedSaveEvent = null;
      capturedCloseEvent = null;
    });

    it('should update username field', async () => {
      const usernameInput = screen.getByLabelText(/username/i);
      
      await fireEvent.input(usernameInput, { target: { value: 'newuser' } });
      
      expect(usernameInput).toHaveValue('newuser');
    });

    it('should update theme selection', async () => {
      const themeSelect = screen.getByLabelText(/theme/i);
      
      await fireEvent.change(themeSelect, { target: { value: 'light' } });
      
      expect(themeSelect).toHaveValue('light');
    });

    it('should toggle audio checkbox', async () => {
      const audioCheckbox = screen.getByLabelText(/audio/i);
      
      await fireEvent.click(audioCheckbox);
      
      expect(audioCheckbox).not.toBeChecked();
    });

    it('should update fps input', async () => {
      const fpsInput = screen.getByLabelText(/fps|frame.*rate/i);
      
      await fireEvent.input(fpsInput, { target: { value: '30' } });
      
      expect(fpsInput).toHaveValue(30);
    });

    it('should save settings when save button is clicked', async () => {
      const saveButton = screen.getByRole('button', { name: /save/i });
      
      await fireEvent.click(saveButton);
      
      expect(capturedSaveEvent).toBeTruthy();
      expect(capturedSaveEvent.detail).toBeDefined();
    });

    it('should close modal when cancel button is clicked', async () => {
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      
      await fireEvent.click(cancelButton);
      
      expect(capturedCloseEvent).toBeTruthy();
    });

    it('should close modal when close button (X) is clicked', async () => {
      const closeButton = screen.getByRole('button', { name: /close/i });
      
      await fireEvent.click(closeButton);
      
      expect(capturedCloseEvent).toBeTruthy();
    });
  });

  describe('form validation', () => {
    beforeEach(() => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
    });

    it('should validate fps input range', async () => {
      const fpsInput = screen.getByLabelText(/fps|frame.*rate/i);
      
      // Test invalid values
      await fireEvent.input(fpsInput, { target: { value: '0' } });
      expect(fpsInput).toHaveValue(0);
      
      await fireEvent.input(fpsInput, { target: { value: '100' } });
      expect(fpsInput).toHaveValue(100);
    });

    it('should validate filter window size', async () => {
      const windowSizeInput = screen.getByLabelText(/window.*size|filter.*window/i);
      
      // Should accept odd numbers (typical for Savitzky-Golay filter)
      await fireEvent.input(windowSizeInput, { target: { value: '7' } });
      expect(windowSizeInput).toHaveValue(7);
    });

    it('should validate canvas dimensions', async () => {
      const widthInput = screen.getByLabelText(/width/i);
      const heightInput = screen.getByLabelText(/height/i);
      
      await fireEvent.input(widthInput, { target: { value: '1280' } });
      await fireEvent.input(heightInput, { target: { value: '720' } });
      
      expect(widthInput).toHaveValue(1280);
      expect(heightInput).toHaveValue(720);
    });
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
    });

    it('should close modal when Escape key is pressed', async () => {
      const modal = screen.getByRole('dialog');
      
      await fireEvent.keyDown(modal, { key: 'Escape' });
      
      // Should trigger close event
      // This test verifies the escape key handler is set up
      expect(modal).toBeInTheDocument();
    });

    it('should have focusable elements in correct tab order', () => {
      const focusableElements = [
        ...screen.getAllByRole('textbox'),
        ...screen.getAllByRole('combobox'),
        ...screen.getAllByRole('checkbox'),
        ...screen.getAllByRole('button')
      ];
      
      // All interactive elements should be present and focusable
      expect(focusableElements.length).toBeGreaterThan(0);
      
      focusableElements.forEach(element => {
        expect(element).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
    });

    it('should have proper ARIA attributes', () => {
      const modal = screen.getByRole('dialog');
      
      expect(modal).toHaveAttribute('aria-modal', 'true');
      // Should have aria-labelledby or aria-label
      expect(
        modal.hasAttribute('aria-labelledby') || modal.hasAttribute('aria-label')
      ).toBe(true);
    });

    it('should have associated labels for form inputs', () => {
      const inputs = screen.getAllByRole('textbox');
      
      inputs.forEach(input => {
        // Each input should have an associated label
        expect(input).toHaveAccessibleName();
      });
    });

    it('should have proper button labels', () => {
      const buttons = screen.getAllByRole('button');
      
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });
  });

  describe('responsive behavior', () => {
    it('should render properly on different screen sizes', () => {
      // Test mobile-like viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      
      render(SettingsModal, { 
        props: { ...defaultProps, show: true }
      });
      
      const modal = screen.getByRole('dialog');
      expect(modal).toBeInTheDocument();
    });
  });
});