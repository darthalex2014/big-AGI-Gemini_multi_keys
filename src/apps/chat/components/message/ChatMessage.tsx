import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import TimeAgo from 'react-timeago';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SxProps } from '@mui/joy/styles/types';
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  ListDivider,
  ListItem,
  ListItemDecorator,
  MenuItem,
  Modal,
  ModalClose,
  Switch,
  Textarea,
  Tooltip,
  Typography
} from '@mui/joy';
import { ClickAwayListener, Popper } from '@mui/base';
import {
  AccountTreeOutlined,
  AlternateEmail,
  CheckRounded,
  CloseRounded,
  ContentCopy,
  DeleteOutline,
  Difference,
  EditRounded,
  ForkRight,
  FormatBold,
  FormatPaintOutlined,
  InsertLink,
  MoreVert,
  NotificationsActive,
  NotificationsOutlined,
  RecordVoiceOverOutlined,
  Replay,
  ReplyAllRounded,
  ReplyRounded,
  Settings,
  StrikethroughS,
  Telegram,
  Texture,
  VerticalAlignBottom,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

// Оригинальные импорты проекта
import { ModelVendorAnthropic } from '~/modules/llms/vendors/anthropic/anthropic.vendor';
import { AnthropicIcon } from '~/common/components/icons/vendors/AnthropicIcon';
import { ChatBeamIcon } from '~/common/components/icons/ChatBeamIcon';
import { CloseablePopup } from '~/common/components/CloseablePopup';
import { DMessage, DMessageId, DMessageUserFlag, DMetaReferenceItem, MESSAGE_FLAG_AIX_SKIP, MESSAGE_FLAG_NOTIFY_COMPLETE, MESSAGE_FLAG_STARRED, MESSAGE_FLAG_VND_ANT_CACHE_AUTO, MESSAGE_FLAG_VND_ANT_CACHE_USER, messageFragmentsReduceText, messageHasUserFlag } from '~/common/stores/chat/chat.message';
import { KeyStroke } from '~/common/components/KeyStroke';
import { MarkHighlightIcon } from '~/common/components/icons/MarkHighlightIcon';
import { TooltipOutlined } from '~/common/components/TooltipOutlined';
import { adjustContentScaling, themeScalingMap, themeZIndexChatBubble } from '~/common/app.theme';
import { avatarIconSx, makeMessageAvatarIcon, messageBackground, useMessageAvatarLabel } from '~/common/util/dMessageUtils';
import { copyToClipboard } from '~/common/util/clipboardUtils';
import { createTextContentFragment, DMessageFragment, DMessageFragmentId, updateFragmentWithEditedText } from '~/common/stores/chat/chat.fragments';
import { useFragmentBuckets } from '~/common/stores/chat/hooks/useFragmentBuckets';
import { useUIPreferencesStore } from '~/common/state/store-ui';
import { useUXLabsStore } from '~/common/state/store-ux-labs';

import { BlockOpContinue } from './BlockOpContinue';
import { ContentFragments } from './fragments-content/ContentFragments';
import { DocumentAttachmentFragments } from './fragments-attachment-doc/DocumentAttachmentFragments';
import { ImageAttachmentFragments } from './fragments-attachment-image/ImageAttachmentFragments';
import { InReferenceToList } from './in-reference-to/InReferenceToList';
import { messageAsideColumnSx, messageAvatarLabelAnimatedSx, messageAvatarLabelSx, messageZenAsideColumnSx } from './ChatMessage.styles';
import { setIsNotificationEnabledForModel, useChatShowTextDiff } from '../../store-app-chat';
import { useSelHighlighterMemo } from './useSelHighlighterMemo';

// Типы и константы для перевода
interface TranslationSettings {
  apiKey: string;
  languageModel: string;
  sourceLang: string;
  targetLang: string;
  systemPrompt: string;
}

const useTranslationStore = create<TranslationSettings & {
  setTranslationSettings: (settings: Partial<TranslationSettings>) => void;
}>()(
  persist(
    (set) => ({
      apiKey: '',
      languageModel: 'gemini-2.0-flash-exp',
      sourceLang: 'English',
      targetLang: 'Russian',
      systemPrompt: 'Translate from {sourceLang} to {targetLang}:\n{text}',
      setTranslationSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'translation-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Добавить здесь отсутствующий тип
export type ChatMessageTextPartEditState = {
  [fragmentId: DMessageFragmentId]: string;
};

// Константы стилей
const ENABLE_CONTEXT_MENU = false;
const ENABLE_BUBBLE = true;
export const BUBBLE_MIN_TEXT_LENGTH = 3;
const ENABLE_COPY_MESSAGE_OVERLAY = false;

const messageBodySx: SxProps = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: { xs: 0, md: 1 },
};

const messageBodyReverseSx: SxProps = {
  ...messageBodySx,
  flexDirection: 'row-reverse',
};

export const messageSkippedSx = {
  border: '1px dashed',
  borderColor: 'neutral.solidBg',
  filter: 'grayscale(1)',
} as const;

const personaAvatarOrMenuSx: SxProps = {
  display: 'flex',
};

const editButtonWrapSx: SxProps = {
  overflowWrap: 'anywhere',
  mb: -0.5,
};

const fragmentsListSx: SxProps = {
  flexGrow: 1,
  minWidth: 0,
  my: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
};

const antCachePromptOffSx: SxProps = {
  transition: 'color 0.16s, transform 0.16s',
};

const antCachePromptOnSx: SxProps = {
  ...antCachePromptOffSx,
  color: ModelVendorAnthropic.brandColor,
  transform: 'rotate(90deg)',
};

export const ChatMessageMemo = React.memo(ChatMessage);

export function ChatMessage(props: {
  message: DMessage;
  diffPreviousText?: string;
  fitScreen: boolean;
  hasInReferenceTo?: boolean;
  isMobile: boolean;
  isBottom?: boolean;
  isImagining?: boolean;
  isSpeaking?: boolean;
  hideAvatar?: boolean;
  showAntPromptCaching?: boolean;
  showBlocksDate?: boolean;
  showUnsafeHtmlCode?: boolean;
  adjustContentScaling?: number;
  topDecorator?: React.ReactNode;
  onAddInReferenceTo?: (item: DMetaReferenceItem) => void;
  onMessageAssistantFrom?: (messageId: string, offset: number) => Promise<void>;
  onMessageBeam?: (messageId: string) => Promise<void>;
  onMessageBranch?: (messageId: string) => void;
  onMessageContinue?: (messageId: string) => void;
  onMessageDelete?: (messageId: string) => void;
  onMessageFragmentAppend?: (messageId: DMessageId, fragment: DMessageFragment) => void;
  onMessageFragmentDelete?: (messageId: DMessageId, fragmentId: DMessageFragmentId) => void;
  onMessageFragmentReplace?: (messageId: DMessageId, fragmentId: DMessageFragmentId, newFragment: DMessageFragment) => void;
  onMessageToggleUserFlag?: (messageId: string, flag: DMessageUserFlag, maxPerConversation?: number) => void;
  onMessageTruncate?: (messageId: string) => void;
  onTextDiagram?: (messageId: string, text: string) => Promise<void>;
  onTextImagine?: (text: string) => Promise<void>;
  onTextSpeak?: (text: string) => Promise<void>;
  sx?: SxProps;
}) {
  // Оригинальные состояния компонента
  const blocksRendererRef = React.useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = React.useState(false);
  const [selText, setSelText] = React.useState<string | null>(null);
  const [bubbleAnchor, setBubbleAnchor] = React.useState<HTMLElement | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [opsMenuAnchor, setOpsMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [textContentEditState, setTextContentEditState] = React.useState<ChatMessageTextPartEditState | null>(null);

  // Состояния для перевода
  const [translationSettingsOpen, setTranslationSettingsOpen] = React.useState(false);
  const [translationInProgress, setTranslationInProgress] = React.useState(false);
  const [originalFragments, setOriginalFragments] = React.useState<DMessageFragment[] | null>(null);

  // Настройки перевода
  const {
    apiKey,
    languageModel,
    sourceLang,
    targetLang,
    systemPrompt,
    setTranslationSettings,
  } = useTranslationStore();

  // Оригинальные производные состояния
  const {
    id: messageId,
    role: messageRole,
    fragments: messageFragments,
    pendingIncomplete: messagePendingIncomplete,
    purposeId: messagePurposeId,
    generator: messageGenerator,
    metadata: messageMetadata,
    created: messageCreated,
    updated: messageUpdated,
  } = props.message;

  const fromAssistant = messageRole === 'assistant';
  const fromSystem = messageRole === 'system';
  const fromUser = messageRole === 'user';
  const messageHasBeenEdited = !!messageUpdated;

  const isUserMessageSkipped = messageHasUserFlag(props.message, MESSAGE_FLAG_AIX_SKIP);
  const isUserStarred = messageHasUserFlag(props.message, MESSAGE_FLAG_STARRED);
  const isUserNotifyComplete = messageHasUserFlag(props.message, MESSAGE_FLAG_NOTIFY_COMPLETE);
  const isVndAndCacheAuto = !!props.showAntPromptCaching && messageHasUserFlag(props.message, MESSAGE_FLAG_VND_ANT_CACHE_AUTO);
  const isVndAndCacheUser = !!props.showAntPromptCaching && messageHasUserFlag(props.message, MESSAGE_FLAG_VND_ANT_CACHE_USER);

  const {
    imageAttachments,
    contentOrVoidFragments,
    nonImageAttachments,
  } = useFragmentBuckets(messageFragments);

  const fragmentFlattenedText = React.useMemo(() => messageFragmentsReduceText(messageFragments), [messageFragments]);
  const handleHighlightSelText = useSelHighlighterMemo(messageId, selText, contentOrVoidFragments, fromAssistant, props.onMessageFragmentReplace);

  const textSubject = selText ? selText : fragmentFlattenedText;
  const isSpecialT2I = textSubject.startsWith('https://images.prodia.xyz/') || textSubject.startsWith('/draw ') || textSubject.startsWith('/imagine ') || textSubject.startsWith('/img ');
  const couldDiagram = textSubject.length >= 100 && !isSpecialT2I;
  const couldImagine = textSubject.length >= 3 && !isSpecialT2I;
  const couldSpeak = couldImagine;

  // Оригинальные обработчики
  const { onMessageAssistantFrom, onMessageDelete, onMessageFragmentAppend, onMessageFragmentDelete, onMessageFragmentReplace } = props;

  const handleFragmentNew = React.useCallback(() => {
    onMessageFragmentAppend?.(messageId, createTextContentFragment(''));
  }, [messageId, onMessageFragmentAppend]);

  const handleFragmentDelete = React.useCallback((fragmentId: DMessageFragmentId) => {
    onMessageFragmentDelete?.(messageId, fragmentId);
  }, [messageId, onMessageFragmentDelete]);

  const handleFragmentReplace = React.useCallback((fragmentId: DMessageFragmentId, newFragment: DMessageFragment) => {
    onMessageFragmentReplace?.(messageId, fragmentId, newFragment);
  }, [messageId, onMessageFragmentReplace]);

  const isEditingText = !!textContentEditState;

  const handleApplyEdit = React.useCallback((fragmentId: DMessageFragmentId, editedText: string) => {
    if (!editedText.length) return handleFragmentDelete(fragmentId);
    const oldFragment = messageFragments.find(f => f.fId === fragmentId);
    if (!oldFragment) return;
    const newFragment = updateFragmentWithEditedText(oldFragment, editedText);
    if (newFragment) handleFragmentReplace(fragmentId, newFragment);
  }, [handleFragmentDelete, handleFragmentReplace, messageFragments]);

  const handleApplyAllEdits = React.useCallback(async (withControl: boolean) => {
    const state = textContentEditState || {};
    setTextContentEditState(null);
    for (const [fragmentId, editedText] of Object.entries(state)) handleApplyEdit(fragmentId, editedText);
    if (withControl && onMessageAssistantFrom) await onMessageAssistantFrom(messageId, 0);
  }, [handleApplyEdit, messageId, onMessageAssistantFrom, textContentEditState]);

  // Логика перевода
  const selectApiKey = React.useCallback(() => {
    const keys = apiKey.split(',').filter(Boolean);
    return keys[Math.floor(Math.random() * keys.length)] || null;
  }, [apiKey]);

  const translateText = React.useCallback(async (text: string) => {
    const key = selectApiKey();
    if (!key) throw new Error('No valid API key found');
    
    const formattedPrompt = systemPrompt
      .replace('{sourceLang}', sourceLang)
      .replace('{targetLang}', targetLang)
      .replace('{text}', text);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${languageModel}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: formattedPrompt }] }],
        safetySettings: [
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }, [selectApiKey, systemPrompt, sourceLang, targetLang, languageModel]);

  const handleTranslateMessage = React.useCallback(async () => {
    setTranslationInProgress(true);
    try {
      setOriginalFragments([...messageFragments]);
      const translatedFragments = await Promise.all(
        messageFragments.map(async (fragment) => {
          if (fragment.type === 'text') {
            const translatedText = await translateText(fragment.text);
            return { ...fragment, text: translatedText || fragment.text };
          }
          return fragment;
        })
      );
      props.onMessageFragmentReplace?.(messageId, translatedFragments);
    } finally {
      setTranslationInProgress(false);
    }
  }, [messageFragments, translateText, messageId, props.onMessageFragmentReplace]);

  const handleRevertOriginal = React.useCallback(() => {
    if (originalFragments) {
      props.onMessageFragmentReplace?.(messageId, originalFragments);
      setOriginalFragments(null);
    }
  }, [originalFragments, messageId, props.onMessageFragmentReplace]);

  // Модальное окно настроек перевода
  const TranslationSettingsModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const [localSettings, setLocalSettings] = React.useState({
      apiKey,
      languageModel,
      sourceLang,
      targetLang,
      systemPrompt,
    });

    React.useEffect(() => {
      setLocalSettings({
        apiKey,
        languageModel,
        sourceLang,
        targetLang,
        systemPrompt,
      });
    }, [open]);

    const handleSave = () => {
      setTranslationSettings(localSettings);
      onClose();
    };

    return (
      <Modal open={open} onClose={onClose} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{
          width: '90%',
          maxWidth: 600,
          bgcolor: 'background.surface',
          p: 3,
          borderRadius: 'md',
          boxShadow: 'lg',
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography level="h4">Translation Settings</Typography>
            <ModalClose sx={{ position: 'static' }} />
          </Box>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel>API Keys (comma-separated)</FormLabel>
            <Textarea
              value={localSettings.apiKey}
              onChange={(e) => setLocalSettings(s => ({ ...s, apiKey: e.target.value }))}
              minRows={3}
            />
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel>Source Language</FormLabel>
            <Input
              value={localSettings.sourceLang}
              onChange={(e) => setLocalSettings(s => ({ ...s, sourceLang: e.target.value }))}
            />
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel>Target Language</FormLabel>
            <Input
              value={localSettings.targetLang}
              onChange={(e) => setLocalSettings(s => ({ ...s, targetLang: e.target.value }))}
            />
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <FormLabel>System Prompt</FormLabel>
            <Textarea
              value={localSettings.systemPrompt}
              onChange={(e) => setLocalSettings(s => ({ ...s, systemPrompt: e.target.value }))}
              minRows={4}
            />
          </FormControl>

          <ButtonGroup sx={{ mt: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} sx={{ ml: 1 }}>Save</Button>
          </ButtonGroup>
        </Box>
      </Modal>
    );
  };

  // Оригинальная разметка компонента
  const backgroundColor = messageBackground(messageRole, messageHasBeenEdited, false);
  const listItemSx: SxProps = React.useMemo(() => ({
    '--AGI-overlay-start-opacity': uiComplexityMode === 'extra' ? 0.1 : 0,
    backgroundColor: backgroundColor,
    px: { xs: 1, md: themeScalingMap[adjContentScaling]?.chatMessagePadding ?? 2 },
    py: themeScalingMap[adjContentScaling]?.chatMessagePadding ?? 2,
    ...(!('borderBottom' in (props.sx || {})) && {
      borderBottom: '1px solid',
      borderBottomColor: 'divider',
    }),
    ...(isUserStarred && {
      outline: '3px solid',
      outlineColor: 'primary.solidBg',
      boxShadow: 'lg',
      borderRadius: 'lg',
      zIndex: 1,
    }),
    ...(isVndAndCacheUser && {
      borderInlineStart: `0.125rem solid ${ModelVendorAnthropic.brandColor}`,
    }),
    ...(uiComplexityMode === 'extra' && isVndAndCacheAuto && !isVndAndCacheUser && {
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '0.125rem',
        background: `repeating-linear-gradient( -45deg, transparent, transparent 2px, ${ModelVendorAnthropic.brandColor} 2px, ${ModelVendorAnthropic.brandColor} 12px ) repeat`,
      },
    }),
    ...(isUserMessageSkipped && messageSkippedSx),
    ...(isEditingText && { zIndex: 1 }),
    display: 'block',
    ...props.sx,
  }), [adjContentScaling, backgroundColor, isEditingText, isUserMessageSkipped, isUserStarred, isVndAndCacheAuto, isVndAndCacheUser, props.sx, uiComplexityMode]);

  const zenMode = uiComplexityMode === 'minimal';
  const showAvatarIcon = !props.hideAvatar && !zenMode;
  const messageGeneratorName = messageGenerator?.name;
  const messageAvatarIcon = React.useMemo(
    () => !showAvatarIcon ? null : makeMessageAvatarIcon(uiComplexityMode, messageRole, messageGeneratorName, messagePurposeId, !!messagePendingIncomplete, isUserMessageSkipped, isUserNotifyComplete, true),
    [isUserMessageSkipped, isUserNotifyComplete, messageGeneratorName, messagePendingIncomplete, messagePurposeId, messageRole, showAvatarIcon, uiComplexityMode],
  );

  const { label: messageAvatarLabel, tooltip: messageAvatarTooltip } = useMessageAvatarLabel(props.message, uiComplexityMode);

  return (
    <Box
      component='li'
      role='chat-message'
      tabIndex={-1}
      onMouseUp={ENABLE_BUBBLE && !fromSystem ? handleBlocksMouseUp : undefined}
      sx={listItemSx}
    >
      {props.topDecorator}

      <Box sx={(fromAssistant && !isEditingText) ? messageBodySx : messageBodyReverseSx}>
        {!props.hideAvatar && !isEditingText && (
          <Box sx={zenMode ? messageZenAsideColumnSx : messageAsideColumnSx}>
            <Box
              onClick={handleOpsMenuToggle}
              onContextMenu={handleOpsMenuToggle}
              onMouseEnter={props.isMobile ? undefined : () => setIsHovering(true)}
              onMouseLeave={props.isMobile ? undefined : () => setIsHovering(false)}
              sx={personaAvatarOrMenuSx}
            >
              {showAvatarIcon && !isHovering && !opsMenuAnchor ? (
                messageAvatarIcon
              ) : (
                <IconButton
                  size='sm'
                  variant={opsMenuAnchor ? 'solid' : (zenMode && fromAssistant) ? 'plain' : 'soft'}
                  color={(fromAssistant || fromSystem) ? 'neutral' : 'primary'}
                  sx={avatarIconSx}
                >
                  <MoreVert />
                </IconButton>
              )}
            </Box>

            {fromAssistant && !zenMode && (
              <TooltipOutlined asLargePane enableInteractive title={messageAvatarTooltip} placement='bottom-start'>
                <Typography level='body-xs' sx={messagePendingIncomplete ? messageAvatarLabelAnimatedSx : messageAvatarLabelSx}>
                  {messageAvatarLabel}
                </Typography>
              </TooltipOutlined>
            )}
          </Box>
        )}

        {isEditingText && (
          <Box sx={messageAsideColumnSx} className='msg-edit-button'>
            <Tooltip arrow disableInteractive title='Apply Edits'>
              <IconButton size='sm' variant='solid' color='warning' onClick={handleEditsApplyClicked}>
                <CheckRounded />
              </IconButton>
            </Tooltip>
            <Typography level='body-xs' sx={editButtonWrapSx}>Done</Typography>
          </Box>
        )}

        <Box ref={blocksRendererRef} sx={fragmentsListSx}>
          {(props.showBlocksDate && (messageUpdated || messageCreated)) && (
            <Typography level='body-sm' sx={{ mx: 1.5, textAlign: fromAssistant ? 'left' : 'right' }}>
              <TimeAgo date={messageUpdated || messageCreated} />
            </Typography>
          )}

          {fromSystem && messageHasBeenEdited && (
            <Typography level='body-sm' color='warning' sx={{ mt: 1, mx: 1.5, textAlign: 'end' }}>
              modified by user - auto-update disabled
            </Typography>
          )}

          {!!messageMetadata?.inReferenceTo?.length && <InReferenceToList items={messageMetadata.inReferenceTo} />}

          {imageAttachments.length >= 1 && (
            <ImageAttachmentFragments
              imageAttachments={imageAttachments}
              contentScaling={adjContentScaling}
              messageRole={messageRole}
              disabled={isEditingText}
              onFragmentDelete={handleFragmentDelete}
            />
          )}

          <ContentFragments
            fragments={contentOrVoidFragments}
            showEmptyNotice={!messageFragments.length && !messagePendingIncomplete}
            contentScaling={adjContentScaling}
            uiComplexityMode={uiComplexityMode}
            fitScreen={props.fitScreen}
            isMobile={props.isMobile}
            messageRole={messageRole}
            optiAllowSubBlocksMemo={!!messagePendingIncomplete}
            disableMarkdownText={disableMarkdown || fromUser}
            showUnsafeHtmlCode={props.showUnsafeHtmlCode}
            enhanceCodeBlocks={labsEnhanceCodeBlocks}
            textEditsState={textContentEditState}
            setEditedText={(!props.onMessageFragmentReplace || messagePendingIncomplete) ? undefined : handleEditSetText}
            onEditsApply={handleApplyAllEdits}
            onEditsCancel={handleEditsCancel}
            onFragmentBlank={handleFragmentNew}
            onFragmentDelete={handleFragmentDelete}
            onFragmentReplace={handleFragmentReplace}
            onMessageDelete={props.onMessageDelete ? handleOpsDelete : undefined}
            onContextMenu={(props.onMessageFragmentReplace && ENABLE_CONTEXT_MENU) ? handleBlocksContextMenu : undefined}
            onDoubleClick={(props.onMessageFragmentReplace) ? handleBlocksDoubleClick : undefined}
          />

          {nonImageAttachments.length >= 1 && (
            <DocumentAttachmentFragments
              attachmentFragments={nonImageAttachments}
              messageRole={messageRole}
              contentScaling={adjContentScaling}
              isMobile={props.isMobile}
              zenMode={zenMode}
              allowSelection={!isEditingText}
              disableMarkdownText={disableMarkdown}
              onFragmentDelete={handleFragmentDelete}
              onFragmentReplace={handleFragmentReplace}
            />
          )}

          {props.isBottom && messageGenerator?.tokenStopReason === 'out-of-tokens' && !!props.onMessageContinue && (
            <BlockOpContinue
              contentScaling={adjContentScaling}
              messageId={messageId}
              messageRole={messageRole}
              onContinue={props.onMessageContinue}
            />
          )}
        </Box>

        {isEditingText && (
          <Box sx={messageAsideColumnSx} className='msg-edit-button'>
            <Tooltip arrow disableInteractive title='Discard Edits'>
              <IconButton size='sm' variant='solid' onClick={handleEditsCancel}>
                <CloseRounded />
              </IconButton>
            </Tooltip>
            <Typography level='body-xs' sx={editButtonWrapSx}>Cancel</Typography>
          </Box>
        )}
      </Box>

      {ENABLE_COPY_MESSAGE_OVERLAY && !fromSystem && !isEditingText && (
        <Tooltip title={messagePendingIncomplete ? null : (fromAssistant ? 'Copy message' : 'Copy input')} variant='solid'>
          <IconButton
            variant='outlined'
            onClick={handleOpsCopy}
            sx={{
              position: 'absolute',
              ...(fromAssistant ? { right: { xs: 12, md: 28 } } : { left: { xs: 12, md: 28 } }),
              zIndex: 10,
              opacity: 0,
              transition: 'opacity 0.16s cubic-bezier(.17,.84,.44,1)',
            }}
          >
            <ContentCopy />
          </IconButton>
        </Tooltip>
      )}

      {!!opsMenuAnchor && (
        <CloseablePopup
          menu
          anchorEl={opsMenuAnchor}
          onClose={handleCloseOpsMenu}
          dense
          minWidth={280}
          placement={fromAssistant ? 'auto-start' : 'auto-end'}
        >
          {fromSystem && (
            <ListItem>
              <Typography level='body-sm'>System message</Typography>
            </ListItem>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {!!props.onMessageFragmentReplace && (
              <MenuItem variant='plain' disabled={!!messagePendingIncomplete} onClick={handleOpsEditToggle} sx={{ flex: 1 }}>
                <ListItemDecorator>{isEditingText ? <CloseRounded /> : <EditRounded />}</ListItemDecorator>
                {isEditingText ? 'Discard' : 'Edit'}
              </MenuItem>
            )}
            <MenuItem onClick={handleOpsCopy} sx={{ flex: 1 }}>
              <ListItemDecorator><ContentCopy /></ListItemDecorator>
              Copy
            </MenuItem>
            {!!onMessageToggleUserFlag && (
              <MenuItem onClick={handleOpsToggleStarred} sx={{ flexGrow: 0, px: 1 }}>
                <Tooltip disableInteractive title={!isUserStarred ? 'Link message - use @ to refer to it from another chat' : 'Remove link'}>
                  {isUserStarred
                    ? <AlternateEmail color='primary' sx={{ fontSize: 'xl' }} />
                    : <InsertLink sx={{ rotate: '45deg' }} />}
                </Tooltip>
              </MenuItem>
            )}
          </Box>

          {messagePendingIncomplete && !!onMessageToggleUserFlag && (
            <>
              <ListDivider />
              <MenuItem onClick={handleOpsToggleNotifyComplete}>
                <ListItemDecorator>{isUserNotifyComplete ? <NotificationsActive /> : <NotificationsOutlined />}</ListItemDecorator>
                Notify on reply
              </MenuItem>
            </>
          )}

          {!messagePendingIncomplete && (
            <>
              <ListDivider />
              {!isUserMessageSkipped && !!props.showAntPromptCaching && (
                <MenuItem onClick={handleOpsToggleAntCacheUser}>
                  <ListItemDecorator><AnthropicIcon sx={isVndAndCacheUser ? antCachePromptOnSx : antCachePromptOffSx} /></ListItemDecorator>
                  {isVndAndCacheUser ? 'Do not cache' : <>Cache <span style={{ opacity: 0.5 }}>up to here</span></>}
                </MenuItem>
              )}
              {!isUserMessageSkipped && !!props.showAntPromptCaching && isVndAndCacheAuto && !isVndAndCacheUser && (
                <MenuItem disabled>
                  <ListItemDecorator><Texture sx={{ color: ModelVendorAnthropic.brandColor }} /></ListItemDecorator>
                  Auto-Cached <span style={{ opacity: 0.5 }}>for 5 min</span>
                </MenuItem>
              )}
              {!!props.onMessageToggleUserFlag && (
                <MenuItem onClick={handleOpsToggleSkipMessage}>
                  <ListItemDecorator>{isUserMessageSkipped ? <VisibilityOff sx={{ color: 'danger.plainColor' }} /> : <Visibility />}</ListItemDecorator>
                  {isUserMessageSkipped ? 'Unskip' : 'Skip AI processing'}
                </MenuItem>
              )}
            </>
          )}

          {!!props.onMessageBranch && <ListDivider />}
          {!!props.onMessageBranch && (
            <MenuItem onClick={handleOpsBranch} disabled={fromSystem}>
              <ListItemDecorator><ForkRight /></ListItemDecorator>
              Branch
              {!props.isBottom && <span style={{ opacity: 0.5 }}>from here</span>}
            </MenuItem>
          )}
          {!!props.onMessageDelete && (
            <MenuItem onClick={handleOpsDelete} disabled={false}>
              <ListItemDecorator><DeleteOutline /></ListItemDecorator>
              Delete
              <span style={{ opacity: 0.5 }}>message</span>
            </MenuItem>
          )}
          {!!props.onMessageTruncate && (
            <MenuItem onClick={handleOpsTruncate} disabled={props.isBottom}>
              <ListItemDecorator><VerticalAlignBottom /></ListItemDecorator>
              Truncate
              <span style={{ opacity: 0.5 }}>after this</span>
            </MenuItem>
          )}

          {!!props.onTextDiagram && <ListDivider />}
          {!!props.onTextDiagram && (
            <MenuItem onClick={handleOpsDiagram} disabled={!couldDiagram}>
              <ListItemDecorator><AccountTreeOutlined /></ListItemDecorator>
              Auto-Diagram ...
            </MenuItem>
          )}
          {!!props.onTextImagine && (
            <MenuItem onClick={handleOpsImagine} disabled={!couldImagine || props.isImagining}>
              <ListItemDecorator>{props.isImagining ? <CircularProgress size='sm' /> : <FormatPaintOutlined />}</ListItemDecorator>
              Auto-Draw
            </MenuItem>
          )}
          {!!props.onTextSpeak && (
            <MenuItem onClick={handleOpsSpeak} disabled={!couldSpeak || props.isSpeaking}>
              <ListItemDecorator>{props.isSpeaking ? <CircularProgress size='sm' /> : <RecordVoiceOverOutlined />}</ListItemDecorator>
              Speak
            </MenuItem>
          )}

          {!!props.diffPreviousText && (
            <>
              <ListDivider />
              <MenuItem onClick={handleOpsToggleShowDiff}>
                <ListItemDecorator><Difference /></ListItemDecorator>
                Show difference
                <Switch checked={showDiff} onChange={handleOpsToggleShowDiff} sx={{ ml: 'auto' }} />
              </MenuItem>
            </>
          )}

          {(!!props.onMessageAssistantFrom || !!props.onMessageBeam) && <ListDivider />}
          {!!props.onMessageAssistantFrom && (
            <MenuItem disabled={fromSystem} onClick={handleOpsAssistantFrom}>
              <ListItemDecorator>{fromAssistant ? <Replay color='primary' /> : <Telegram color='primary' />}</ListItemDecorator>
              {!fromAssistant
                ? <>Restart <span style={{ opacity: 0.5 }}>from here</span></>
                : !props.isBottom
                  ? <>Retry <span style={{ opacity: 0.5 }}>from here</span></>
                  : <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'space-between', gap: 1 }}>Retry<KeyStroke variant='outlined' combo='Ctrl + Shift + Z' /></Box>}
            </MenuItem>
          )}
          {!!props.onMessageBeam && (
            <MenuItem disabled={fromSystem} onClick={handleOpsBeamFrom}>
              <ListItemDecorator><ChatBeamIcon color={fromSystem ? undefined : 'primary'} /></ListItemDecorator>
              {!fromAssistant
                ? <>Beam <span style={{ opacity: 0.5 }}>from here</span></>
                : !props.isBottom
                  ? <>Beam Edit</>
                  : <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'space-between', gap: 1 }}>Beam Edit<KeyStroke variant='outlined' combo='Ctrl + Shift + B' /></Box>}
            </MenuItem>
          )}

          <ListDivider />
          {originalFragments && (
            <MenuItem onClick={handleRevertOriginal}>
              <ListItemDecorator><Replay /></ListItemDecorator>
              Revert Original
            </MenuItem>
          )}
          <MenuItem onClick={handleTranslateMessage} disabled={translationInProgress}>
            <ListItemDecorator>
              {translationInProgress ? <CircularProgress size="sm" /> : <ContentCopy />}
            </ListItemDecorator>
            Translate
          </MenuItem>
          <MenuItem onClick={() => setTranslationSettingsOpen(true)}>
            <ListItemDecorator><Settings /></ListItemDecorator>
            Translation Settings
          </MenuItem>
        </CloseablePopup>
      )}

      <TranslationSettingsModal open={translationSettingsOpen} onClose={() => setTranslationSettingsOpen(false)} />
    </Box>
  );
}
