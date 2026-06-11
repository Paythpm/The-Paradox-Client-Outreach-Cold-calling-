import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { scheduleMeeting, sendConfirmation } from '../services/meetingService';
import { getCityTimezone, formatMeetingTime, getNextBusinessSlots, COUNTRY_TIMEZONES } from '../utils/timezones';

export default function MeetingScheduler({ business, callLogId, onMeetingScheduled, onClose }) {
  const { caller } = useAuth();
  const [step, setStep] = useState('details');
  const [selectedDateTime, setSelectedDateTime] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState('');
  const [topic, setTopic] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [channel, setChannel] = useState('sms');
  const [error, setError] = useState(null);
  const [createdMeeting, setCreatedMeeting] = useState(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const quickSlots = getNextBusinessSlots(business?.country_code, selectedTimezone);

  useEffect(() => {
    const tz = getCityTimezone(business?.city, business?.country_code);
    setSelectedTimezone(tz);
    setTopic(business?.top_pain_point ? `${business.top_pain_point} + review strategy` : 'Quick intro call');

    // Default to tomorrow 10am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    setSelectedDateTime(tomorrow.toISOString().slice(0, 16));
  }, [business]);

  const buildMessage = () => {
    const formattedTime = selectedDateTime ? formatMeetingTime(new Date(selectedDateTime).toISOString(), selectedTimezone) : '';
    const callerName = caller?.full_name || 'our team';

    if (channel === 'whatsapp') {
      return `👋 Hi ${business?.business_name}!\n\nGreat speaking with you. Here's your meeting summary:\n\n📅 *${formattedTime}*\n🎯 *Topic:* ${topic}${meetingLink ? '\n🔗 *Link:* ' + meetingLink : ''}\n\nReply *YES* to confirm or *RESCHEDULE* to pick a new time.`;
    }
    return `Hi ${business?.business_name}, thanks for chatting with ${callerName} today!\n\nI'd love to follow up on ${topic} in a quick 15-min call.\n\n📅 ${formattedTime}\n\nReply YES to confirm or suggest another time that works for you.`;
  };

  const handleSend = async () => {
    setError(null);
    setStep('sending');

    try {
      const meeting = await scheduleMeeting({
        businessId: business.id,
        callLogId,
        bookedBy: caller.id,
        scheduledAt: new Date(selectedDateTime).toISOString(),
        timezone: selectedTimezone,
        topic,
        meetingLink,
        channel,
      });

      setCreatedMeeting(meeting);

      await sendConfirmation(meeting.id, business, caller, buildMessage(), channel);

      setStep('sent');

      // Poll for confirmation
      const pollInterval = setInterval(async () => {
        const { data } = await import('../lib/supabase').then(m =>
          m.default.from('meetings').select('confirmed_at').eq('id', meeting.id).single()
        );
        if (data?.confirmed_at) {
          setIsConfirmed(true);
          clearInterval(pollInterval);
        }
      }, 5000);

      setTimeout(() => clearInterval(pollInterval), 30000);
    } catch (err) {
      setError(err.message);
      setStep('confirm');
    }
  };

  const toRecipient = channel === 'whatsapp' ? business?.whatsapp : channel === 'email' ? business?.email : business?.phone;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
            {step === 'sent' ? '✓ Meeting Scheduled' : 'Schedule a Meeting'}
          </h3>
          {step !== 'sending' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 20 }}>×</button>
          )}
        </div>

        {/* STEP: details */}
        {step === 'details' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Timezone</label>
              <select value={selectedTimezone} onChange={e => setSelectedTimezone(e.target.value)} style={inputStyle}>
                {(COUNTRY_TIMEZONES[business?.country_code] || ['UTC']).map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Quick Select Time</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {quickSlots.slice(0, 6).map(slot => (
                  <button key={slot.value} onClick={() => setSelectedDateTime(slot.value.slice(0, 16))}
                    style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${selectedDateTime === slot.value.slice(0, 16) ? 'var(--accent)' : 'var(--border)'}`, background: selectedDateTime === slot.value.slice(0, 16) ? 'var(--accent-glow)' : 'var(--surface2)', color: selectedDateTime === slot.value.slice(0, 16) ? 'var(--accent2)' : 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Date & Time</label>
              <input type="datetime-local" value={selectedDateTime} onChange={e => setSelectedDateTime(e.target.value)} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Topic</label>
              <input type="text" value={topic} onChange={e => setTopic(e.target.value)} style={inputStyle} placeholder="e.g. Booking system + review strategy" />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Meeting Link (optional)</label>
              <input type="text" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} style={inputStyle} placeholder="https://meet.google.com/... (optional)" />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Send Confirmation Via</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { key: 'sms', label: '📱 SMS', available: !!business?.phone },
                  { key: 'whatsapp', label: '💬 WhatsApp', available: !!business?.whatsapp },
                  { key: 'email', label: '📧 Email', available: !!business?.email },
                ].filter(c => c.available).map(c => (
                  <button key={c.key} onClick={() => setChannel(c.key)}
                    style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${channel === c.key ? 'var(--accent)' : 'var(--border)'}`, background: channel === c.key ? 'var(--accent-glow)' : 'var(--surface2)', color: channel === c.key ? 'var(--accent2)' : 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
                    {c.label}
                  </button>
                ))}
              </div>
              {toRecipient && <p style={{ color: 'var(--text3)', fontSize: 12, marginTop: 6 }}>Sending to: {toRecipient}</p>}
            </div>

            <button onClick={() => setStep('confirm')} disabled={!selectedDateTime}
              style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Preview & Confirm →
            </button>
          </div>
        )}

        {/* STEP: confirm */}
        {step === 'confirm' && (
          <div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Message Preview</p>
              <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{buildMessage()}</p>
            </div>
            <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20 }}>
              This message will be sent to <strong style={{ color: 'var(--text2)' }}>{toRecipient}</strong>
            </p>
            {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('details')} style={{ flex: 1, padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>← Back</button>
              <button onClick={handleSend} style={{ flex: 2, padding: '12px', background: 'var(--green)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Send Confirmation ✓</button>
            </div>
          </div>
        )}

        {/* STEP: sending */}
        {step === 'sending' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text)', fontWeight: 500 }}>Sending confirmation...</p>
            <style>{`.spinner{width:36px;height:36px;border:2px solid var(--border);border-top:2px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* STEP: sent */}
        {step === 'sent' && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: 64, height: 64, background: 'var(--green-bg)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
            <h3 style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 8 }}>Meeting confirmation sent!</h3>
            {isConfirmed && <p style={{ color: 'var(--green)', fontSize: 13, marginBottom: 8 }}>✓ Confirmed by business!</p>}
            {createdMeeting && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 16px', margin: '16px 0', textAlign: 'left' }}>
                <p style={{ color: 'var(--text2)', fontSize: 13 }}>📅 {formatMeetingTime(createdMeeting.scheduled_at, createdMeeting.timezone)}</p>
                <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>🎯 {createdMeeting.topic}</p>
              </div>
            )}
            <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20 }}>Reminders will be sent 24 hours and 1 hour before the meeting</p>
            <button
              onClick={() => { onMeetingScheduled && onMeetingScheduled(createdMeeting); onClose(); }}
              style={{ width: '100%', padding: '12px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
