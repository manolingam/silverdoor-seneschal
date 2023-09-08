'use client';

import { useEffect, useState } from 'react';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { ToastAction } from '@/components/ui/toast';
import { Image, Loader2, CalendarIcon } from 'lucide-react';

import { isAddress } from 'viem';
import {
  useContractWrite,
  useSignTypedData,
  useWaitForTransaction
} from 'wagmi';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';

import * as z from 'zod';

import { useProposal } from '@/hooks/useProposal';
import { useIpfs } from '@/hooks/useIpfs';
import { useRedis } from '@/hooks/useRedis';

import { formatCommitment, getTypes } from '@/lib/helpers';
import { SENESCHAL_CONTRACT_ADDRESS } from '@/config';

import SeneschalAbi from '../abis/Seneschal.json';

const formSchema = z.object({
  loot: z.string().refine((val) => Number(val) > 0 && Number(val) < 100, {
    message: 'Must be between 1 & 99'
  }),
  expirationDate: z.date({
    required_error: 'Proposal expiration date required.'
  }),
  recipientWallet: z.string().refine((value) => isAddress(value), {
    message: 'Not a valid ethereum address.'
  })
});

export function SponsorForm({ isSponsor }) {
  const { toast } = useToast();
  const {
    getProposalSummary,
    gptMessages,
    writing,
    proposalSummary,
    setProposalSummary,
    arweaveTx
  } = useProposal();
  const { uploadToIpfs, ipfsUploading } = useIpfs();
  const { setMeta, redisLoading } = useRedis();

  const [imgUrl, setImgUrl] = useState('');
  const [proposalUrl, setProposalUrl] = useState('');
  const [commitment, setCommitment] = useState('');

  const { signTypedData, isLoading: signaturePending } = useSignTypedData({
    onSuccess(signature) {
      write({
        args: [commitment, signature]
      });
    }
  });

  const {
    isLoading: writePending,
    write,
    data: writeData
  } = useContractWrite({
    address: SENESCHAL_CONTRACT_ADDRESS,
    abi: SeneschalAbi,
    functionName: 'sponsor',
    onSuccess(data) {
      toast({
        title: 'Mining Transaction',
        description: 'Please do not close the tab.',
        action: (
          <ToastAction
            altText='View Tx'
            onClick={() =>
              window.open(`https://gnosisscan.io/tx/${data.hash}`, '_blank')
            }
          >
            View Tx
          </ToastAction>
        )
      });
    },
    onError(err) {
      console.log(err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Function call failed.'
      });
    }
  });

  const { isLoading: txPending } = useWaitForTransaction({
    hash: writeData?.hash,
    async onSuccess(data) {
      if (data.logs) {
        let topics = data.logs[0].topics;
        let ipfsHash = await uploadToIpfs(
          imgUrl,
          commitment.contextURL,
          arweaveTx,
          proposalSummary
        );
        await setMeta(topics[2], ipfsHash);
      }

      form.reset();
      setImgUrl('');
      setProposalUrl('');
      setCommitment('');
      setProposalSummary('');
      toast({
        title: 'Success',
        description: 'Proposal sponsored.'
      });
    }
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      loot: '',
      expirationDate: '',
      recipientWallet: ''
    }
  });

  const onSubmit = (values) => {
    if (!imgUrl) {
      return toast({
        variant: 'destructive',
        title: 'Missing Input',
        description: 'Proposal image is required.'
      });
    }
    values['proposalUrl'] = proposalUrl;
    let _commitment = formatCommitment(values);
    setCommitment(_commitment);
  };

  const handleSponsor = async () => {
    let { values, domain, types } = await getTypes(commitment);

    signTypedData({
      domain,
      types,
      message: values,
      primaryType: 'Commitment'
    });
  };

  useEffect(() => {
    if (commitment) {
      handleSponsor();
    }
  }, [commitment]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8 mt-12'>
        <div className='grid grid-cols-2 gap-5'>
          <FormField
            control={form.control}
            name='loot'
            render={({ field }) => (
              <FormItem>
                <FormLabel className='font-bold'>Loot</FormLabel>
                <FormControl>
                  <Input
                    placeholder=''
                    min={1}
                    type='number'
                    inputMode='decimal'
                    {...field}
                  />
                </FormControl>
                <FormDescription className='text-xs'>
                  Amount of loot to reward.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='recipientWallet'
            render={({ field }) => (
              <FormItem>
                <FormLabel className='font-bold'>Recipient</FormLabel>
                <FormControl>
                  <Input placeholder='0x..' type='string' {...field} />
                </FormControl>
                <FormDescription className='text-xs'>
                  Wallet address of the recipient
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid grid-cols-2 gap-5'>
          <div className='flex flex-col'>
            <FormField
              control={form.control}
              name='proposalUrl'
              render={({ field }) => (
                <FormItem>
                  <FormLabel className='font-bold'>Proposal Url</FormLabel>
                  <FormControl>
                    <Input
                      placeholder=''
                      onChange={(e) => {
                        setProposalUrl(e.target.value);
                        if (!proposalSummary) {
                          getProposalSummary(
                            e.target.value.substring(
                              e.target.value.lastIndexOf('/') + 1
                            )
                          );
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription className='text-xs'>
                    The full url of the mirror article.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid grid-cols-2 mt-4'>
              <FormField
                control={form.control}
                name='expirationDate'
                render={({ field }) => (
                  <FormItem className='flex flex-col justify-start'>
                    <FormLabel className='font-bold'>Expiration Date</FormLabel>
                    <Popover className='mb-0 pb-0'>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-[240px] pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < Date.now()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription className='text-xs'>
                      Date after which the commitment cannot be claimed
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='proposalImage'
                render={({ field }) => (
                  <FormItem className='cursor-pointer flex flex-col justify-start '>
                    <FormLabel className='font-bold'>Proposal Image</FormLabel>
                    <FormControl>
                      <Input
                        className='cursor-pointer hover:bg-gray-100'
                        id='image-input'
                        type='file'
                        accept='image/png'
                        {...field}
                        onChange={(e) => {
                          setImgUrl(
                            e.target.files.length
                              ? URL.createObjectURL(e.target.files[0])
                              : ''
                          );
                        }}
                      />
                    </FormControl>
                    <FormDescription className='text-xs'>
                      Image to use in metadata.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='h-32 mt-4 flex flex-col items-center justify-center border-2 border-gray-300 border-dashed rounded-lg bg-gray-50   '>
              {imgUrl ? (
                <img
                  id='preview_img'
                  className='h-full w-full object-cover'
                  src={imgUrl}
                />
              ) : (
                <Image className='h-16 w-16 ' />
              )}
            </div>
          </div>

          <FormItem>
            <div className='w-full flex flex-row justify-between items-center'>
              <FormLabel className='font-bold'>Proposal Summary </FormLabel>
              <Button
                variant='outline'
                disabled={writing || !proposalSummary}
                onClick={() =>
                  getProposalSummary(
                    proposalUrl.substring(proposalUrl.lastIndexOf('/') + 1)
                  )
                }
              >
                Regenerate Summary
              </Button>
            </div>

            <FormControl>
              <Textarea
                className='h-full'
                disabled
                value={
                  gptMessages.length > 1
                    ? gptMessages[gptMessages.length - 1].content
                    : 'A short summary of the proposal will be ai generated based on the proposal digest contents.'
                }
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </div>

        <Button
          type='submit'
          disabled={
            signaturePending ||
            writing ||
            writePending ||
            txPending ||
            ipfsUploading ||
            redisLoading ||
            !isSponsor
          }
        >
          {(signaturePending ||
            writing ||
            writePending ||
            txPending ||
            ipfsUploading ||
            redisLoading) && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}

          {!isSponsor
            ? 'Not a Sponsor'
            : signaturePending
            ? 'Pending signature'
            : ipfsUploading
            ? 'Uploading to IPFS'
            : writing
            ? 'Summarizing'
            : writePending || txPending
            ? 'Pending transaction'
            : redisLoading
            ? 'Storing hashes'
            : 'Sponsor Proposal'}
        </Button>
      </form>
    </Form>
  );
}
