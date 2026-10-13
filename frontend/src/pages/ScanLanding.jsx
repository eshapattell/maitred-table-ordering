// ScanLanding.jsx: Guest table QR landing and join screen
import React, { useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Navigate } from 'react-router-dom';
import { parseJoinLink, validateJoinForm, joinErrorMessage, JOIN_MESSAGES } from '../utils/guestJoin.js';
import { joinTable, saveGuestToken, readGuestToken } from '../services/guestService.js';
import { ROUTE_PATHS } from '../utils/routePaths.js';
import Button from '../Components/Common/Button.jsx';
import ErrorMessage from '../Components/Common/ErrorMessage.jsx';
import { MESSAGES } from '../utils/messages.js';

export const ScanLanding = () => {
  const { restaurantId, tableNo } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const parsed = parseJoinLink({ restaurantId, tableNo, token });

  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const nameInputRef = useRef(null);
  const phoneInputRef = useRef(null);

  if (!parsed.ok) {
    return (
      <div className="page-content guest-page">
        <div className="guest-card">
          <p className="notice-text">{JOIN_MESSAGES.tableNotFound}</p>
        </div>
      </div>
    );
  }

  if (readGuestToken()) {
    return <Navigate to={ROUTE_PATHS.GUEST_AREA} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setServerError(null);
    const result = validateJoinForm({ phone, nickname });
    if (!result.valid) {
      setErrors(result.errors);
      if (result.errors.nickname && nameInputRef.current) {
        nameInputRef.current.focus();
      } else if (result.errors.phone && phoneInputRef.current) {
        phoneInputRef.current.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await joinTable({
        restaurantId: parsed.restaurantId,
        tableNumber: parsed.tableNumber,
        qrToken: parsed.qrToken,
        phone: result.values.phone,
        nickname: result.values.nickname,
      });
      saveGuestToken(res.token);
      setNickname('');
      setPhone('');
      navigate(ROUTE_PATHS.GUEST_AREA, { replace: true });
    } catch (err) {
      setSubmitting(false);
      setServerError(joinErrorMessage(err));
    }
  };

  const handleNameChange = (e) => {
    setNickname(e.target.value);
    setServerError(null);
    setErrors((prev) => {
      if (!prev.nickname) return prev;
      const { nickname: _, ...rest } = prev;
      return rest;
    });
  };

  const handlePhoneChange = (e) => {
    setPhone(e.target.value);
    setServerError(null);
    setErrors((prev) => {
      if (!prev.phone) return prev;
      const { phone: _, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div className="page-content guest-page">
      <div className="guest-card">
        <h1 className="page-title">{MESSAGES.guest.joinTableHeading(parsed.tableNumber)}</h1>

        {serverError && <ErrorMessage>{serverError}</ErrorMessage>}

        <form onSubmit={handleSubmit} noValidate className="guest-join-form">
          <div className="field">
            <label htmlFor="join-name" className="field-label">
              {MESSAGES.guest.joinNameLabel}
            </label>
            <p id="join-name-hint" className="field-hint">
              {MESSAGES.guest.joinNameHint}
            </p>
            <input
              ref={nameInputRef}
              id="join-name"
              type="text"
              className="field-input"
              value={nickname}
              maxLength={30}
              autoComplete="nickname"
              aria-invalid={errors.nickname ? 'true' : undefined}
              aria-describedby={errors.nickname ? 'join-name-error join-name-hint' : 'join-name-hint'}
              onChange={handleNameChange}
            />
            {errors.nickname && (
              <div id="join-name-error" role="alert" className="field-error">
                {errors.nickname}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="join-phone" className="field-label">
              {MESSAGES.guest.joinPhoneLabel}
            </label>
            <p id="join-phone-hint" className="field-hint">
              {MESSAGES.guest.joinPhoneHint}
            </p>
            <div className="phone-input-group">
              <span className="phone-prefix" aria-hidden="true">+91</span>
              <input
                ref={phoneInputRef}
                id="join-phone"
                type="tel"
                inputMode="tel"
                className="field-input phone-input"
                value={phone}
                autoComplete="tel-national"
                aria-label={MESSAGES.guest.joinPhoneLabel}
                aria-invalid={errors.phone ? 'true' : undefined}
                aria-describedby={errors.phone ? 'join-phone-error join-phone-hint' : 'join-phone-hint'}
                onChange={handlePhoneChange}
              />
            </div>
            {errors.phone && (
              <div id="join-phone-error" role="alert" className="field-error">
                {errors.phone}
              </div>
            )}
          </div>

          <p className="privacy-note">
            {MESSAGES.guest.joinPrivacyNote}
          </p>

          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            aria-busy={submitting ? 'true' : undefined}
            className="btn--full"
          >
            {MESSAGES.guest.joinButton}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ScanLanding;
